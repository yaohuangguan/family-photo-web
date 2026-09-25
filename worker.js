const CITIES={
  shijiazhuang:{lat:38.0428,lon:114.5149,tz:"Asia/Shanghai"},
  auckland:{lat:-36.8509,lon:174.7645,tz:"Pacific/Auckland"}
};
const DAILY="weather_code,temperature_2m_max,temperature_2m_min,apparent_temperature_max,apparent_temperature_min,wind_speed_10m_max";
const PHOTO_COOKIE="family_photo_access";
const PHOTO_MAX_AGE=60*60*24*30;

export default {
  async fetch(request,env){
    const url=new URL(request.url);
    if(url.pathname==="/api/weather")return weatherResponse(url);
    if(url.pathname==="/api/photo/status")return Response.json({unlocked:await photoAuthorized(request,env)});
    if(url.pathname==="/api/photo/unlock"&&request.method==="POST")return unlockPhoto(request,env);
    if(url.pathname==="/api/photo/original")return serveOriginalPhoto(request,env);
    if(url.pathname==="/assets/family-photo.jpg")return new Response("Not found",{status:404});
    if(url.pathname.startsWith("/api/board")||url.pathname.startsWith("/api/boards")||url.pathname.startsWith("/api/family")){
      const id=env.FAMILY_BOARD.idFromName("main-family-board");
      return env.FAMILY_BOARD.get(id).fetch(request);
    }
    return env.ASSETS.fetch(request);
  }
};

async function unlockPhoto(request,env){
  const body=await readJson(request),code=String(body.code||"");
  if(!env.PHOTO_CODE||code!==env.PHOTO_CODE)return Response.json({ok:false,error:"密码不正确"},{status:401});
  const expires=Math.floor(Date.now()/1000)+PHOTO_MAX_AGE;
  const sig=await signPhoto(expires,env.PHOTO_CODE);
  return Response.json({ok:true},{headers:{"Set-Cookie":`${PHOTO_COOKIE}=${expires}.${sig}; Path=/; Max-Age=${PHOTO_MAX_AGE}; HttpOnly; Secure; SameSite=Lax`}});
}
async function photoAuthorized(request,env){
  if(!env.PHOTO_CODE)return false;
  const cookies=request.headers.get("Cookie")||"",match=cookies.match(new RegExp(`(?:^|;\\s*)${PHOTO_COOKIE}=([^;]+)`));
  if(!match)return false;
  const [expiresRaw,sig]=decodeURIComponent(match[1]).split("."),expires=Number(expiresRaw);
  if(!Number.isFinite(expires)||expires<Math.floor(Date.now()/1000)||!sig)return false;
  return sig===await signPhoto(expires,env.PHOTO_CODE);
}
async function signPhoto(expires,secret){
  const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
  const bytes=new Uint8Array(await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(`${expires}:family-photo`)));
  return [...bytes].map(b=>b.toString(16).padStart(2,"0")).join("");
}
async function serveOriginalPhoto(request,env){
  if(!(await photoAuthorized(request,env)))return Response.json({error:"locked"},{status:401});
  const u=new URL(request.url);u.pathname="/assets/family-photo.jpg";u.search="";
  const asset=await env.ASSETS.fetch(new Request(u.toString(),request));
  const headers=new Headers(asset.headers);headers.set("Cache-Control","private, max-age=3600");
  return new Response(asset.body,{status:asset.status,headers});
}async function weatherResponse(url){
  const requested=url.searchParams.get("date")||new Date().toISOString().slice(0,10);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(requested))return Response.json({error:"invalid date"},{status:400});
  try{
    const entries=await Promise.all(Object.entries(CITIES).map(async([name,cfg])=>[name,await weatherForDate(cfg,requested)]));
    return Response.json(Object.fromEntries(entries),{headers:{"Cache-Control":"public, max-age=300"}});
  }catch(err){
    return Response.json({error:"weather unavailable",detail:String(err?.message||err)},{status:502});
  }
}
function localDateInZone(tz){
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
    if(url.pathname==="/api/boards"&&request.method==="GET")return Response.json({boards:await this.ensureBoards()});
    if(url.pathname==="/api/boards"&&request.method==="POST")return this.createBoard(request);
    if(url.pathname==="/api/board"){
      if(request.headers.get("Upgrade")!=="websocket")return new Response("WebSocket required",{status:426});
      const boards=await this.ensureBoards(),requested=String(url.searchParams.get("board")||"main");
      const boardId=boards.some(b=>b.id===requested)?requested:"main";
      const pair=new WebSocketPair(),client=pair[0],server=pair[1];
      this.state.acceptWebSocket(server);
      server.serializeAttachment({boardId});
      const strokes=(await this.state.storage.get(this.strokeKey(boardId)))||[];
      server.send(JSON.stringify({type:"snapshot",boardId,strokes}));
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
  async ensureBoards(){
    let boards=await this.state.storage.get("boards");
    if(!Array.isArray(boards)||!boards.length){
      boards=[{id:"main",name:"家庭画板",createdAt:new Date().toISOString()}];
      await this.state.storage.put("boards",boards);
    }
    return boards;
  }
  strokeKey(id){return id==="main"?"strokes":`strokes:${id}`;}
  async createBoard(request){
    const body=await readJson(request),name=String(body.name||"").trim().slice(0,24);
    let boards=await this.ensureBoards();
    if(boards.length>=30)return Response.json({error:"画板数量已达上限"},{status:400});
    const board={id:crypto.randomUUID(),name:name||`新画板 ${boards.length+1}`,createdAt:new Date().toISOString()};
    boards.push(board);await this.state.storage.put("boards",boards);this.broadcast({type:"boards-update"});
    return Response.json({board});
  }  async saveVisit(request){
    const body=await readJson(request),day=safeDay(body.day),profile=sanitizeProfile(body.profile);
    let visitors=(await this.state.storage.get(`visitors:${day}`))||[];
    const idx=visitors.findIndex(v=>v.id===profile.id),visit={...profile,lastSeen:new Date().toISOString()};
    if(idx>=0)visitors[idx]=visit;else visitors.push(visit);
    visitors=visitors.slice(-40);await this.state.storage.put(`visitors:${day}`,visitors);this.broadcast({type:"family-update"});
    return Response.json({ok:true});
  }
  async saveMessage(request){
    const body=await readJson(request),profile=sanitizeProfile(body.profile),text=String(body.text||"").trim().slice(0,240);
    if(!text)return Response.json({error:"empty message"},{status:400});
    let messages=(await this.state.storage.get("messages"))||[];
    messages.push({id:crypto.randomUUID(),name:profile.name,avatar:profile.avatar,text,createdAt:new Date().toISOString()});
    messages=messages.slice(-200);await this.state.storage.put("messages",messages);this.broadcast({type:"family-update"});
    return Response.json({ok:true});
  }
  async webSocketMessage(ws,message){
    let msg;try{msg=JSON.parse(typeof message==="string"?message:new TextDecoder().decode(message));}catch{return;}
    const boardId=ws.deserializeAttachment()?.boardId||"main",key=this.strokeKey(boardId);
    if(msg.type==="segment"&&msg.stroke){this.broadcastBoard(boardId,{type:"segment",clientId:msg.clientId,stroke:sanitizeStroke(msg.stroke)},ws);return;}
    if(msg.type==="stroke"&&msg.stroke){
      const stroke=sanitizeStroke(msg.stroke);let strokes=(await this.state.storage.get(key))||[];
      strokes.push(stroke);if(strokes.length>3000)strokes=strokes.slice(-3000);
      await this.state.storage.put(key,strokes);this.broadcastBoard(boardId,{type:"stroke",stroke},ws);return;
    }
    if(msg.type==="clear"){await this.state.storage.put(key,[]);this.broadcastBoard(boardId,{type:"clear"},null);}
  }
  broadcastBoard(boardId,payload,except){
    const data=JSON.stringify(payload);
    for(const socket of this.state.getWebSockets()){
      if(socket===except)continue;
      if((socket.deserializeAttachment()?.boardId||"main")!==boardId)continue;
      try{socket.send(data)}catch{}
    }
  }
  broadcast(payload){
    const data=JSON.stringify(payload);
    for(const socket of this.state.getWebSockets()){try{socket.send(data)}catch{}}
  }
}
async function readJson(request){try{return await request.json()}catch{return {}}}
function safeDay(day){return /^\d{4}-\d{2}-\d{2}$/.test(String(day||""))?String(day):new Date().toISOString().slice(0,10)}
function sanitizeProfile(p){return {id:String(p?.id||crypto.randomUUID()).slice(0,80),name:String(p?.name||"家人").trim().slice(0,18)||"家人",avatar:String(p?.avatar||"🏡").slice(0,8)};}
function sanitizeStroke(s){
  const points=Array.isArray(s.points)?s.points.slice(0,4000).map(p=>[clamp(Number(p?.[0]),0,1),clamp(Number(p?.[1]),0,1)]):[];
  return {id:String(s.id||crypto.randomUUID()).slice(0,80),color:/^#[0-9a-fA-F]{6}$/.test(s.color)?s.color:"#7f4f3a",size:clamp(Number(s.size)||5,1,30),erase:Boolean(s.erase),points};
}
function clamp(n,min,max){return Number.isFinite(n)?Math.min(max,Math.max(min,n)):min;}
