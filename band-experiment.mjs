#!/usr/bin/env node
/** One-off: compare candidate frequency bands for the human-noise signal.
 *  For 5 city-adjacent and 5 remote GSN stations, pull ~8 days of PSDs and compute per band:
 *   swing = local daytime mean - night mean (dB)      [human signature: bigger is better]
 *   wknd  = weekday-day mean - weekend-day mean (dB)  [human signature: bigger is better]
 *   rough = median |hour-to-hour change| (dB)         [noise floor: smaller is better]
 *   ratio = swing / rough                             [signal-to-wobble: bigger is better]
 */
const CITY = [["IU.ANTO.00.BHZ",32.79,"Ankara"],["IU.INCN.00.BHZ",126.62,"Incheon"],
  ["IU.TATO.00.BHZ",121.49,"Taipei"],["IU.MAJO.00.BHZ",138.20,"Matsushiro"],["II.NNA.00.BHZ",-76.84,"Nana-Lima"]];
const REMOTE = [["II.BORG.00.BHZ",-21.33,"Borgarnes"],["IU.TSUM.00.BHZ",17.58,"Tsumeb"],
  ["II.EFI.00.BHZ",-58.06,"E-Falkland"],["IU.KEV.00.BHZ",27.00,"Kevo"],["IU.XMAS.00.BHZ",-157.45,"Kiritimati"]];
const BANDS = { "4-14":[4,14], "2-15":[2,15], "2-4":[2,4] };

function parsePsd(txt){
  const wins=[]; const re=/<Psd\b([^>]*)>([\s\S]*?)<\/Psd>/g;
  const attr=(s,n)=>{const m=s.match(new RegExp(n+'="([^"]+)"'));return m?m[1]:null};
  let m;
  while((m=re.exec(txt))){
    const end=Date.parse(attr(m[1],'end')||attr(m[1],'start')||'');
    const pairs=[]; const v=/<value\b[^>]*freq="([^"]+)"[^>]*power="([^"]+)"/g; let x;
    while((x=v.exec(m[2])))pairs.push([parseFloat(x[1]),parseFloat(x[2])]);
    if(Number.isFinite(end)&&pairs.length)wins.push({end,pairs});
  }
  return wins;
}
function metrics(wins,lo,hi,lon){
  const ms=[];
  for(const w of wins){let s=0,n=0;for(const [f,p] of w.pairs)if(f>=lo&&f<=hi&&Number.isFinite(p)){s+=p;n++}if(n>=2)ms.push({end:w.end,db:s/n})}
  ms.sort((a,b)=>a.end-b.end);
  const off=Math.round(lon/15);
  const day=[],night=[],wkdDay=[],wkeDay=[];
  for(const m of ms){
    const d=new Date(m.end+off*3600000);
    const h=d.getUTCHours(),dw=d.getUTCDay();
    if(h>=9&&h<=17){day.push(m.db);(dw===0||dw===6?wkeDay:wkdDay).push(m.db)}
    if(h>=1&&h<=5)night.push(m.db);
  }
  const mean=a=>a.length?a.reduce((s,v)=>s+v,0)/a.length:NaN;
  const diffs=[];for(let i=1;i<ms.length;i++)diffs.push(Math.abs(ms[i].db-ms[i-1].db));
  diffs.sort((a,b)=>a-b);
  const rough=diffs.length?diffs[Math.floor(diffs.length/2)]:NaN;
  const swing=mean(day)-mean(night), wknd=mean(wkdDay)-mean(wkeDay);
  return {n:ms.length,swing:+swing.toFixed(2),wknd:+wknd.toFixed(2),rough:+rough.toFixed(2),ratio:+(swing/(rough||NaN)).toFixed(2)};
}
async function run(){
  const out={city:{},remote:{}};
  for(const [group,list] of [["city",CITY],["remote",REMOTE]]){
    for(const [target,lon,name] of list){
      const end=new Date(),start=new Date(end-8*24*3600000);
      const iso=d=>d.toISOString().slice(0,19);
      try{
        const r=await fetch(`https://service.iris.edu/mustang/noise-psd/1/query?target=${target}.M&starttime=${iso(start)}&endtime=${iso(end)}&format=xml`);
        if(!r.ok)throw new Error('http '+r.status);
        const wins=parsePsd(await r.text());
        out[group][name]={};
        for(const [bn,[lo,hi]] of Object.entries(BANDS))out[group][name][bn]=metrics(wins,lo,hi,lon);
        console.log('ok',name);
      }catch(e){console.log('fail',name,String(e.message||e))}
      await new Promise(res=>setTimeout(res,300));
    }
  }
  // aggregates
  const agg={};
  for(const group of ["city","remote"]){
    agg[group]={};
    for(const bn of Object.keys(BANDS)){
      const rows=Object.values(out[group]).map(s=>s[bn]).filter(Boolean);
      const mean=k=>+(rows.reduce((s,r)=>s+(r[k]||0),0)/rows.length).toFixed(2);
      agg[group][bn]={swing:mean('swing'),wknd:mean('wknd'),rough:mean('rough'),ratio:mean('ratio')};
    }
  }
  console.log('===RESULTS===');
  console.log(JSON.stringify({stations:out,aggregates:agg},null,1));
}
run();
