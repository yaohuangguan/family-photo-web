const CITY_URLS={
  shijiazhuang:"https://api.open-meteo.com/v1/forecast?latitude=38.0428&longitude=114.5149&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m&timezone=Asia%2FShanghai",
  auckland:"https://api.open-meteo.com/v1/forecast?latitude=-36.8509&longitude=174.7645&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m&timezone=Pacific%2FAuckland"
};

export default {
  async fetch(request,env){
    const url=new URL(request.url);
    if(url.pathname==="/api/weather") return weatherResponse();
    if(url.pathname==="/api/board"){
      const id=env.FAMILY_BOARD.idFromName("main-family-board");
      return env.FAMILY_BOARD.get(id).fetch(request);
    }
    return env.ASSETS.fetch(request);
  }
};

async function weatherResponse(){
  try{
    const entries=await Promise.all(Object.entries(CITY_URLS).map(async([name,url])=>{
      const res=await fetch(url);
      if(!res.ok) throw new Error(`weather ${name} ${res.status}`);
      const data=await res.json();
      return [name,data.current];
    }));
    return Response.json(Object.fromEntries(entries),{
      headers:{"Cache-Control":"public, max-age=300"}
    });
  }catch(err){
    return Response.json({error:"weather unavailable"},{status:502});
  }
}export class FamilyBoard {
  constructor(state,env){
    this.state=state;
    this.env=env;
  }

  async fetch(request){
    if(request.headers.get("Upgrade")!=="websocket"){
      return new Response("WebSocket required",{status:426});
    }
    const pair=new WebSocketPair();
    const client=pair[0],server=pair[1];
    this.state.acceptWebSocket(server);
    const strokes=(await this.state.storage.get("strokes"))||[];
    server.send(JSON.stringify({type:"snapshot",strokes}));
    return new Response(null,{status:101,webSocket:client});
  }

  async webSocketMessage(ws,message){
    let msg;
    try{msg=JSON.parse(typeof message==="string"?message:new TextDecoder().decode(message));}
    catch{return;}

    if(msg.type==="segment"&&msg.stroke){
      this.broadcast({type:"segment",clientId:msg.clientId,stroke:sanitizeStroke(msg.stroke)},ws);
      return;
    }

    if(msg.type==="stroke"&&msg.stroke){
      const stroke=sanitizeStroke(msg.stroke);
      let strokes=(await this.state.storage.get("strokes"))||[];
      strokes.push(stroke);
      if(strokes.length>3000) strokes=strokes.slice(-3000);
      await this.state.storage.put("strokes",strokes);
      this.broadcast({type:"stroke",stroke},ws);
      return;
    }

    if(msg.type==="clear"){
      await this.state.storage.put("strokes",[]);
      this.broadcast({type:"clear"},null);
    }
  }

  broadcast(payload,except){
    const data=JSON.stringify(payload);
    for(const socket of this.state.getWebSockets()){
      if(socket!==except){
        try{socket.send(data)}catch{}
      }
    }
  }
}function sanitizeStroke(s){
  const points=Array.isArray(s.points)?s.points.slice(0,4000).map(p=>[
    clamp(Number(p?.[0]),0,1),clamp(Number(p?.[1]),0,1)
  ]):[];
  return {
    id:String(s.id||crypto.randomUUID()).slice(0,80),
    color:/^#[0-9a-fA-F]{6}$/.test(s.color)?s.color:"#7f4f3a",
    size:clamp(Number(s.size)||5,1,30),
    erase:Boolean(s.erase),
    points
  };
}
function clamp(n,min,max){
  return Number.isFinite(n)?Math.min(max,Math.max(min,n)):min;
}
