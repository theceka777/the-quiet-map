#!/usr/bin/env node
/**
 * The Quiet Map: Ground Truth — backend worker
 * Fetches 72h of noise PSDs for every station from IRIS/EarthScope MUSTANG,
 * computes the deseasonalized stillness percentile, writes ./ground.json.
 * Node 18+ (built-in fetch), zero dependencies. Run hourly via cron or CI.
 */

const STATIONS = [
["IU.KONO.00.BHZ","Kongsberg","Norway",59.65,9.60],["II.BFO.00.BHZ","Black Forest","Germany",48.33,8.33],
["II.ESK.00.BHZ","Eskdalemuir","Scotland",55.32,-3.20],["II.BORG.00.BHZ","Borgarnes","Iceland",64.75,-21.33],
["IU.PAB.00.BHZ","San Pablo","Spain",39.55,-4.35],["IU.ANTO.00.BHZ","Ankara","Türkiye",39.87,32.79],
["IU.GNI.00.BHZ","Garni","Armenia",40.15,44.74],["II.OBN.00.BHZ","Obninsk","Russia",55.11,36.57],
["II.KIV.00.BHZ","Kislovodsk","Russia",43.96,42.69],["II.AAK.00.BHZ","Ala-Archa","Kyrgyzstan",42.64,74.49],
["II.ABKT.00.BHZ","Alibek","Turkmenistan",37.93,58.12],["II.NIL.00.BHZ","Nilore","Pakistan",33.65,73.27],
["II.PALK.00.BHZ","Pallekele","Sri Lanka",7.27,80.70],["IU.CHTO.00.BHZ","Chiang Mai","Thailand",18.81,98.94],
["IU.ULN.00.BHZ","Ulaanbaatar","Mongolia",47.87,107.05],["IU.INCN.00.BHZ","Incheon","South Korea",37.48,126.62],
["IU.MAJO.00.BHZ","Matsushiro","Japan",36.55,138.20],["II.ERM.00.BHZ","Erimo","Japan",42.02,143.16],
["IU.TATO.00.BHZ","Taipei","Taiwan",24.97,121.49],["IU.DAV.00.BHZ","Davao","Philippines",7.07,125.58],
["II.KAPI.00.BHZ","Kappang","Indonesia",-5.01,119.75],["IU.GUMO.00.BHZ","Guam","Mariana Is.",13.59,144.87],
["IU.PMG.00.BHZ","Port Moresby","Papua New Guinea",-9.41,147.16],["IU.CTAO.00.BHZ","Charters Towers","Australia",-20.09,146.25],
["II.WRAB.00.BHZ","Tennant Creek","Australia",-19.93,134.36],["IU.MBWA.00.BHZ","Marble Bar","Australia",-21.16,119.73],
["IU.NWAO.00.BHZ","Narrogin","Australia",-32.93,117.24],["II.TAU.00.BHZ","Hobart","Australia",-42.91,147.32],
["IU.SNZO.00.BHZ","Wellington","New Zealand",-41.31,174.70],["IU.RAR.00.BHZ","Rarotonga","Cook Islands",-21.21,-159.77],
["IU.AFI.00.BHZ","Afiamalu","Samoa",-13.91,-171.78],["IU.FUNA.00.BHZ","Funafuti","Tuvalu",-8.53,179.20],
["IU.TARA.00.BHZ","Tarawa","Kiribati",1.36,172.92],["IU.XMAS.00.BHZ","Kiritimati","Kiribati",2.04,-157.45],
["IU.KIP.00.BHZ","Kipapa","Hawaiʻi",21.42,-158.01],["IU.POHA.00.BHZ","Pohakuloa","Hawaiʻi",19.76,-155.53],
["IU.MIDW.00.BHZ","Midway Atoll","US Pacific",28.22,-177.37],["IU.WAKE.00.BHZ","Wake Island","US Pacific",19.28,166.65],
["IU.ADK.00.BHZ","Adak","Alaska",51.88,-176.68],["IU.COLA.00.BHZ","College","Alaska",64.87,-147.86],
["II.KDAK.00.BHZ","Kodiak","Alaska",57.78,-152.58],["IU.COR.00.BHZ","Corvallis","United States",44.59,-123.30],
["II.PFO.00.BHZ","Piñon Flat","California",33.61,-116.46],["IU.TUC.00.BHZ","Tucson","United States",32.31,-110.78],
["IU.ANMO.00.BHZ","Albuquerque","United States",34.95,-106.46],["IU.RSSD.00.BHZ","Black Hills","United States",44.12,-104.04],
["IU.HKT.00.BHZ","Hockley","Texas",29.96,-95.84],["IU.WVT.00.BHZ","Waverly","Tennessee",36.13,-87.83],
["IU.WCI.00.BHZ","Wyandotte Cave","Indiana",38.23,-86.29],["IU.SSPA.00.BHZ","Standing Stone","Pennsylvania",40.64,-77.89],
["IU.HRV.00.BHZ","Harvard","United States",42.51,-71.56],["II.FFC.00.BHZ","Flin Flon","Canada",54.72,-101.98],
["IU.SFJD.00.BHZ","Kangerlussuaq","Greenland",66.99,-50.62],["II.ALE.00.BHZ","Alert","Canada",82.50,-62.35],
["IU.BBSR.00.BHZ","Bermuda","Atlantic",32.37,-64.70],["IU.SJG.00.BHZ","San Juan","Puerto Rico",18.11,-66.15],
["IU.TEIG.00.BHZ","Tepich","Mexico",20.23,-88.28],["IU.SLBS.00.BHZ","Sierra la Laguna","Mexico",23.69,-109.94],
["II.JTS.00.BHZ","Las Juntas","Costa Rica",10.29,-84.95],["IU.SDV.00.BHZ","Santo Domingo","Venezuela",8.88,-70.63],
["IU.OTAV.00.BHZ","Otavalo","Ecuador",0.24,-78.45],["II.NNA.00.BHZ","Ñaña","Peru",-11.99,-76.84],
["IU.LVC.00.BHZ","Limón Verde","Chile",-22.61,-68.91],["IU.TRQA.00.BHZ","Tornquist","Argentina",-38.06,-61.98],
["II.EFI.00.BHZ","East Falkland","Falkland Is.",-51.68,-58.06],["IU.RCBR.00.BHZ","Riachuelo","Brazil",-5.82,-35.90],
["IU.PTGA.00.BHZ","Pitinga","Brazil",-0.73,-59.97],["II.ASCN.00.BHZ","Ascension","Atlantic",-7.93,-14.36],
["II.SACV.00.BHZ","Santiago","Cabo Verde",14.97,-23.61],["II.CMLA.00.BHZ","Chã de Macela","Azores",37.76,-25.52],
["IU.KOWA.00.BHZ","Kowa","Mali",14.50,-4.01],["II.MBAR.00.BHZ","Mbarara","Uganda",-0.60,30.74],
["IU.KMBO.00.BHZ","Kilima Mbogo","Kenya",-1.13,37.25],["IU.FURI.00.BHZ","Furi","Ethiopia",8.90,38.68],
["II.MSEY.00.BHZ","Mahé","Seychelles",-4.67,55.48],["II.ABPO.00.BHZ","Ambohimpanompo","Madagascar",-19.02,47.23],
["IU.TSUM.00.BHZ","Tsumeb","Namibia",-19.20,17.58],["II.SUR.00.BHZ","Sutherland","South Africa",-32.38,20.81],
["IU.LSZ.00.BHZ","Lusaka","Zambia",-15.28,28.19],["II.DGAR.00.BHZ","Diego Garcia","Indian Ocean",-7.41,72.45],
["II.COCO.00.BHZ","Cocos Islands","Indian Ocean",-12.19,96.83],["IU.MAKZ.00.BHZ","Makanchi","Kazakhstan",46.81,81.98],
["II.BRVK.00.BHZ","Borovoye","Kazakhstan",53.06,70.28],["II.ARU.00.BHZ","Arti","Russia",56.43,58.56],
["II.TLY.00.BHZ","Talaya","Russia",51.68,103.64],["IU.YAK.00.BHZ","Yakutsk","Russia",62.03,129.68],
["IU.TIXI.00.BHZ","Tiksi","Russia",71.65,128.87],["IU.BILL.00.BHZ","Bilibino","Russia",68.07,166.45],
["IU.PET.00.BHZ","Petropavlovsk","Russia",53.02,158.65],["IU.MA2.00.BHZ","Magadan","Russia",59.58,150.77],
["IU.YSS.00.BHZ","Yuzhno-Sakhalinsk","Russia",46.96,142.76],["IU.KEV.00.BHZ","Kevo","Finland",69.76,27.00],
["IU.KBS.00.BHZ","Ny-Ålesund","Svalbard",78.92,11.94],["II.UOSS.00.BHZ","Sharjah","UAE",24.95,56.20],
["II.RPN.00.BHZ","Rapa Nui","Chile",-27.13,-109.33],["IU.PTCN.00.BHZ","Pitcairn","Pacific",-25.07,-130.10],
["II.HOPE.00.BHZ","Hope Point","South Georgia",-54.28,-36.49],["II.TRIS.00.BHZ","Tristan da Cunha","Atlantic",-37.07,-12.32],
];

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
  const hsum=new Array(24).fill(0),hn=new Array(24).fill(0);
  for(const m of means){const h=new Date(m.end).getUTCHours();hsum[h]+=m.db;hn[h]++}
  const anom=m=>{const h=new Date(m.end).getUTCHours();return hn[h]?m.db-hsum[h]/hn[h]:null};
  const cur=means[means.length-1],ca=anom(cur);
  if(ca===null)return null;
  const others=means.slice(0,-1).map(anom).filter(a=>a!==null);
  if(others.length<10)return null;
  const below=others.filter(a=>a<ca).length;
  return {p:below/others.length,db:cur.db,
          hist:means.map(mm=>[mm.end,Math.round(mm.db*10)/10])};
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
    const res=stillness(bandMeans(parsePsdXML(await r.text())));
    if(!res)throw new Error('insufficient history');
    return [target.split('.').slice(0,2).join('.'),{place,country,lat,lon,...res}];
  }finally{clearTimeout(to)}
}

async function main(){
  const stations={};const errors={};
  let idx=0;
  await Promise.all(Array.from({length:CONC},async()=>{
    while(idx<STATIONS.length){
      const st=STATIONS[idx++];
      try{
        const [code,data]=await fetchStation(st);
        stations[code]=data;
        console.log('ok  ',code.padEnd(8),'stillness',Math.round((1-data.p)*100));
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
  const fs=await import('fs');
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
  console.log(`archive: ${Object.keys(arch).length} day files touched`);
  console.log(`\nwrote ground.json · ${out.ok} ok · ${out.failed} failed · ${out.generated}`);
  if(!out.ok)process.exit(1);
}
if(process.argv[1]&&import.meta.url.endsWith(process.argv[1].split('/').pop()))main();
