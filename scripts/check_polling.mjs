import http from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
const credentials = JSON.parse(await readFile(new URL('../data/local-access.json', import.meta.url), 'utf8'));
const agent = new http.Agent({keepAlive:true,maxSockets:5});
let cookie = '';
function request(path, body) {
  return new Promise((resolve,reject) => {
    const req=http.request(`http://127.0.0.1:3001/api${path}`,{agent,method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})}},res=>{
      if(res.headers['set-cookie'])cookie=res.headers['set-cookie'][0].split(';')[0];
      let raw='';res.on('data',d=>raw+=d);res.on('end',()=>{
        try{JSON.parse(raw); if(res.statusCode!==200)throw new Error(`HTTP ${res.statusCode}`);resolve({path,status:res.statusCode});}catch(e){reject(e);}
      });
    });
    req.on('error',reject);req.setTimeout(10000,()=>req.destroy(new Error('Timeout')));
    if(body)req.write(JSON.stringify(body));req.end();
  });
}
try {
  await request('/auth/login',{email:credentials.email,password:credentials.password});
  const checks=[];
  for(let cycle=0;cycle<8;cycle++) {
    if(cycle)await new Promise(resolve=>setTimeout(resolve,5000));
    checks.push(...(await Promise.all(['/dashboard','/videos','/cases','/alerts','/settings'].map(p=>request(p)))).map(check=>({...check,cycle})));
  }
  await writeFile(new URL('../docs/polling-check.json',import.meta.url),JSON.stringify({passed:checks.length,failed:0,interval_seconds:5,cycles:8,client:'Node HTTP agent with connection pooling',checks},null,2));
  console.log(`PASS: ${checks.length} authenticated requests over eight pooled polling cycles`);
} finally {agent.destroy();}
