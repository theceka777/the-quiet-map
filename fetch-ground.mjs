#!/usr/bin/env node
/**
 * The Quiet Map: Ground Truth — backend worker
 * Fetches 72h of noise PSDs for every station from IRIS/EarthScope MUSTANG,
 * computes the deseasonalized stillness percentile, writes ./ground.json.
 * Node 18+ (built-in fetch), zero dependencies. Run hourly via cron or CI.
 */

import {readFileSync} from 'fs';
/* single source of truth: the same catalog the page loads */
const {STATIONS}=new Function(
  readFileSync(new URL('./stations.js',import.meta.url),'utf8')+';return {STATIONS}'
)();

const BAND_LO = 4, BAND_HI = 14, HOURS = 168, CONC = 4, TIMEOUT = 40000;

export function parsePsdXML(txt){
  const wins=[];
  const psdRe=/<Psd\b([^>]*)>([\s\S]*?)<\/Psd>/g;
  const attrRe=(s,n)=>{const m=s.match(new RegExp(n+'="([^"]+)"'));return m?m[1]:null};
  let m;
  while((m=psdRe.exec(txt))){
    const end=Date.parse(attrRe(m[1],'end')||attrRe(m[1],'start')||'');
    const pairs=[];
    const vRe=/<value\b[^>]*freq="([^"]+)"[^>]*power="([^"]+)"/g;
    let v;
    while((v=vRe.exec(m[2])))pairs.push([parseFloat(v[1]),parseFloat(v[2])]);
    if(Number.isFinite(end)&&pairs.length)wins.push({end,pairs});
  }
  return wins;
}
export function bandMeans(wins){
  const out=[];
  for(const w of wins){
    let s=0,n=0;
    for(const [f,p] of w.pairs)if(f>=BAND_LO&&f<=BAND_HI&&Number.isFinite(p)){s+=p;n++}
    if(n>=3)out.push({end:w.end,db:s/n});
  }
  return out;
}
export function stillness(means){
  if(means.length<12)return null;
  means.sort((a,b)=>a.end-b.end);
  /* seasonal norm: same hour of day, weekdays and weekends kept apart when the
     bucket has real support (>=3 samples), otherwise plain hour-of-day.
     Without the day-type split, every station on Earth looks "anomalously
     quiet" on Sunday morning. */
  const key=m=>{const d=new Date(m.end);return d.getUTCHours()+((d.getUTCDay()===0||d.getUTCDay()===6)?24:0)};
  const bsum={},bn={},hsum=new Array(24).fill(0),hn=new Array(24).fill(0);
  for(const m of means){
    const k=key(m),h=new Date(m.end).getUTCHours();
    bsum[k]=(bsum[k]||0)+m.db;bn[k]=(bn[k]||0)+1;
    hsum[h]+=m.db;hn[h]++;
  }
  const norm=m=>{
    const k=key(m);
    if((bn[k]||0)>=3)return bsum[k]/bn[k];
    const h=new Date(m.end).getUTCHours();
    return hn[h]?hsum[h]/hn[h]:null;
  };
  const anom=m=>{const mu=norm(m);return mu===null?null:m.db-mu};
  const cur=means[means.length-1],ca=anom(cur);
  if(ca===null)return null;
  const others=means.slice(0,-1).map(anom).filter(a=>a!==null);
  if(others.length<10)return null;
  const below=others.filter(a=>a<ca).length;
  /* serve only the last 7 days as sparkline history; the percentile above may
     rest on a much longer archive-fed baseline */
  const cutoff=cur.end-HOURS*3600000;
  return {p:below/others.length,db:cur.db,
          hist:means.filter(mm=>mm.end>=cutoff).map(mm=>[mm.end,Math.round(mm.db*10)/10])};
}

async function fetchStation(st){
  const [target,place,country,lat,lon]=st;
  const end=new Date(),start=new Date(end-HOURS*3600000);
  const iso=d=>d.toISOString().slice(0,19);
  const url=`https://service.iris.edu/mustang/noise-psd/1/query?target=${target}.M&starttime=${iso(start)}&endtime=${iso(end)}&format=xml`;
  const ac=new AbortController();
  const to=setTimeout(()=>ac.abort(),TIMEOUT);
  try{
    const r=await fetch(url,{signal:ac.signal});
    if(!r.ok)throw new Error('http '+r.status);
    const means=bandMeans(parsePsdXML(await r.text()));
    if(means.length<12)throw new Error('insufficient history');
    return [target.split('.').slice(0,2).join('.'),{place,country,lat,lon},means];
  }finally{clearTimeout(to)}
}

/* extend each station's fresh series with the on-disk archive (up to 28 days)
   so the norm can tell weekday from weekend and the percentile has support */
function loadArchive(fs,days=28){
  const hist={};
  for(let i=0;i<days;i++){
    const day=new Date(Date.now()-i*86400000).toISOString().slice(0,10);
    try{
      const cur=JSON.parse(fs.readFileSync(new URL(`./archive/${day}.json`,import.meta.url),'utf8'));
      for(const code in cur)(hist[code]??=[]).push(...cur[code]);
    }catch(e){}
  }
  return hist;
}

async function main(){
  const fs=await import('fs');
  const archive=loadArchive(fs);
  const stations={};const errors={};
  let idx=0;
  await Promise.all(Array.from({length:CONC},async()=>{
    while(idx<STATIONS.length){
      const st=STATIONS[idx++];
      try{
        const [code,meta,means]=await fetchStation(st);
        const seen=new Set(means.map(m=>m.end));
        const extra=(archive[code]||[]).filter(([end])=>!seen.has(end)).map(([end,db])=>({end,db}));
        const res=stillness(means.concat(extra));
        if(!res)throw new Error('insufficient history');
        stations[code]={...meta,...res};
        console.log('ok  ',code.padEnd(8),'stillness',Math.round((1-res.p)*100),
          extra.length?`(+${extra.length} archived)`:'');
      }catch(e){
        errors[st[0]]=String(e.message||e);
        console.log('fail',st[0],String(e.message||e));
      }
      await new Promise(r=>setTimeout(r,200));
    }
  }));
  const out={
    generated:new Date().toISOString(),
    band:`${BAND_LO}-${BAND_HI}Hz`,hours:HOURS,
    ok:Object.keys(stations).length,failed:Object.keys(errors).length,
    stations,errors
  };
  fs.writeFileSync(new URL('./ground.json',import.meta.url),JSON.stringify(out));
  /* archive: one small file per UTC day, topped up hourly.
     builds the multi-week baseline the pulse detector needs (day-of-week norms). */
  const arch={};
  for(const code in stations){
    for(const [end,db] of stations[code].hist){
      const day=new Date(end).toISOString().slice(0,10);
      ((arch[day]??={})[code]??=[]).push([end,db]);
    }
  }
  fs.mkdirSync(new URL('./archive/',import.meta.url),{recursive:true});
  for(const day in arch){
    const p=new URL(`./archive/${day}.json`,import.meta.url);
    let cur={};
    try{cur=JSON.parse(fs.readFileSync(p,'utf8'))}catch(e){}
    for(const code in arch[day]){
      const seen=new Set((cur[code]??=[]).map(e=>e[0]));
      for(const e of arch[day][code])if(!seen.has(e[0]))cur[code].push(e);
      cur[code].sort((a,b)=>a[0]-b[0]);
    }
    fs.writeFileSync(p,JSON.stringify(cur));
  }
  /* prune: the norm reads 28 days back; keep 35 and delete the rest so the
     archive stays a rolling window, not a landfill */
  for(const f of fs.readdirSync(new URL('./archive/',import.meta.url))){
    const m=f.match(/^(\d{4}-\d{2}-\d{2})\.json$/);
    if(m&&Date.parse(m[1])<Date.now()-35*86400000)
      fs.unlinkSync(new URL(`./archive/${f}`,import.meta.url));
  }
  console.log(`archive: ${Object.keys(arch).length} day files touched`);
  console.log(`\nwrote ground.json · ${out.ok} ok · ${out.failed} failed · ${out.generated}`);
  if(!out.ok)process.exit(1);
}
if(process.argv[1]&&import.meta.url.endsWith(process.argv[1].split('/').pop()))main();
