const CITIES={
  shijiazhuang:{lat:38.0428,lon:114.5149,tz:"Asia/Shanghai"},
  auckland:{lat:-36.8509,lon:174.7645,tz:"Pacific/Auckland"}
};
const DAILY="weather_code,temperature_2m_max,temperature_2m_min,apparent_temperature_max,apparent_temperature_min,wind_speed_10m_max";

export default {
  async fetch(request,env){
    const url=new URL(request.url);
    if(url.pathname==="/api/weather") return weatherResponse(url);
    if(url.pathname.startsWith("/api/board")||url.pathname.startsWith("/api/family")){
      const id=env.FAMILY_BOARD.idFromName("main-family-board");
      return env.FAMILY_BOARD.get(id).fetch(request);
    }
    return env.ASSETS.fetch(request);
  }
};

async function weatherResponse(url){
  const requested=url.searchParams.get("date")||new Date().toISOString().slice(0,10);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(requested))return Response.json({error:"invalid date"},{status:400});
  try{
    const entries=await Promise.all(Object.entries(CITIES).map(async([name,cfg])=>[name,await weatherForDate(cfg,requested)]));
    return Response.json(Object.fromEntries(entries),{headers:{"Cache-Control":"public, max-age=300"}});
  }catch(err){
    return Response.json({error:"weather unavailable",detail:String(err?.message||err)},{status:502});
  }
}function localDateInZone(tz){
  const parts=new Intl.DateTimeFormat("en-CA",{timeZone:tz,year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date());
  const get=t=>parts.find(p=>p.type===t)?.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}
async function weatherForDate(cfg,date){
  const today=localDateInZone(cfg.tz);
  if(date===today){
    const q=new URLSearchParams({latitude:String(cfg.lat),longitude:String(cfg.lon),current:"temperature_2m,apparent_temperature,weather_code,wind_speed_10m",timezone:cfg.tz});
    const res=await fetch(`https://api.open-meteo.com/v1/forecast?${q}`);
    if(!res.ok)throw new Error(`current weather ${res.status}`);
    return {mode:"current",...(await res.json()).current};
  }
  const diff=Math.round((Date.parse(date+"T12:00:00Z")-Date.parse(today+"T12:00:00Z"))/86400000);
  if(diff>16)return {unavailable:true,reason:"该日期距离现在太远，暂时还没有天气预报"};
  const base=diff>=-90?"https://api.open-meteo.com/v1/forecast":"https://archive-api.open-meteo.com/v1/archive";
  const q=new URLSearchParams({latitude:String(cfg.lat),longitude:String(cfg.lon),daily:DAILY,start_date:date,end_date:date,timezone:cfg.tz});
  const res=await fetch(`${base}?${q}`);
  if(!res.ok)return {unavailable:true,reason:"该日期天气数据暂不可用"};
  const data=await res.json(),d=data.daily;
  if(!d?.time?.length)return {unavailable:true,reason:"该日期天气数据暂不可用"};
  return {mode:"daily",weather_code:d.weather_code[0],temperature_2m_max:d.temperature_2m_max[0],temperature_2m_min:d.temperature_2m_min[0],apparent_temperature_max:d.apparent_temperature_max[0],apparent_temperature_min:d.apparent_temperature_min[0],wind_speed_10m_max:d.wind_speed_10m_max[0]};
}export class FamilyBoard {
  constructor(state,env){this.state=state;this.env=env;}
  async fetch(request){
    const url=new URL(request.url);
    if(url.pathname==="/api/board"){
      if(request.headers.get("Upgrade")!=="websocket")return new Response("WebSocket required",{status:426});
      const pair=new WebSocketPair(),client=pair[0],server=pair[1];
      this.state.acceptWebSocket(server);
      const strokes=(await this.state.storage.get("strokes"))||[];
      server.send(JSON.stringify({type:"snapshot",strokes}));
      return new Response(null,{status:101,webSocket:client});
    }
    if(url.pathname==="/api/family"&&request.method==="GET"){
      const day=safeDay(url.searchParams.get("day"));
      return Response.json({messages:(await this.state.storage.get("messages"))||[],visitors:(await this.state.storage.get(`visitors:${day}`))||[]});
    }
    if(url.pathname==="/api/family/visit"&&request.method==="POST")return this.saveVisit(request);
    if(url.pathname==="/api/family/message"&&request.method==="POST")return this.saveMessage(request);
    return new Response("Not found",{status:404});
  }

  async saveVisit(request){
    const body=await readJson(request),day=safeDay(body.day),profile=sanitizeProfile(body.profile);
    let visitors=(await this.state.storage.get(`visitors:${day}`))||[];
    const idx=visitors.findIndex(v=>v.id===profile.id),visit={...profile,lastSeen:new Date().toISOString()};
    if(idx>=0)visitors[idx]=visit;else visitors.push(visit);
    visitors=visitors.slice(-40);
    await this.state.storage.put(`visitors:${day}`,visitors);this.broadcast({type:"family-update"});
    return Response.json({ok:true});
  }

  async saveMessage(request){
    const body=await readJson(request),profile=sanitizeProfile(body.profile),text=String(body.text||"").trim().slice(0,240);
    if(!text)return Response.json({error:"empty message"},{status:400});
    let messages=(await this.state.storage.get("messages"))||[];
    messages.push({id:crypto.randomUUID(),name:profile.name,avatar:profile.avatar,text,createdAt:new Date().toISOString()});
    messages=messages.slice(-200);await this.state.storage.put("messages",messages);this.broadcast({type:"family-update"});
    return Response.json({ok:true});
  }  async webSocketMessage(ws,message){
    let msg;try{msg=JSON.parse(typeof message==="string"?message:new TextDecoder().decode(message));}catch{return;}
    if(msg.type==="segment"&&msg.stroke){this.broadcast({type:"segment",clientId:msg.clientId,stroke:sanitizeStroke(msg.stroke)},ws);return;}
    if(msg.type==="stroke"&&msg.stroke){
      const stroke=sanitizeStroke(msg.stroke);let strokes=(await this.state.storage.get("strokes"))||[];
      strokes.push(stroke);if(strokes.length>3000)strokes=strokes.slice(-3000);
      await this.state.storage.put("strokes",strokes);this.broadcast({type:"stroke",stroke},ws);return;
    }
    if(msg.type==="clear"){await this.state.storage.put("strokes",[]);this.broadcast({type:"clear"},null);}
  }
  broadcast(payload,except){
    const data=JSON.stringify(payload);
    for(const socket of this.state.getWebSockets())if(socket!==except){try{socket.send(data)}catch{}}
  }
}
async function readJson(request){try{return await request.json()}catch{return {}}}
function safeDay(day){return /^\d{4}-\d{2}-\d{2}$/.test(String(day||""))?String(day):new Date().toISOString().slice(0,10)}
function sanitizeProfile(p){
  return {id:String(p?.id||crypto.randomUUID()).slice(0,80),name:String(p?.name||"家人").trim().slice(0,18)||"家人",avatar:String(p?.avatar||"🏡").slice(0,8)};
}
function sanitizeStroke(s){
  const points=Array.isArray(s.points)?s.points.slice(0,4000).map(p=>[clamp(Number(p?.[0]),0,1),clamp(Number(p?.[1]),0,1)]):[];
  return {id:String(s.id||crypto.randomUUID()).slice(0,80),color:/^#[0-9a-fA-F]{6}$/.test(s.color)?s.color:"#7f4f3a",size:clamp(Number(s.size)||5,1,30),erase:Boolean(s.erase),points};
}
function clamp(n,min,max){return Number.isFinite(n)?Math.min(max,Math.max(min,n)):min;}
