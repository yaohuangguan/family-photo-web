const qs=(s,r=document)=>r.querySelector(s);
const qsa=(s,r=document)=>[...r.querySelectorAll(s)];
const pad=n=>String(n).padStart(2,"0");
const weatherCode={
  0:["晴朗","☀️"],1:["大致晴朗","🌤️"],2:["局部多云","⛅"],3:["阴天","☁️"],
  45:["有雾","🌫️"],48:["雾凇","🌫️"],51:["小毛毛雨","🌦️"],53:["毛毛雨","🌦️"],55:["较强毛毛雨","🌧️"],
  61:["小雨","🌦️"],63:["中雨","🌧️"],65:["大雨","🌧️"],71:["小雪","🌨️"],73:["中雪","🌨️"],75:["大雪","❄️"],
  80:["阵雨","🌦️"],81:["阵雨","🌧️"],82:["强阵雨","⛈️"],95:["雷雨","⛈️"],96:["雷雨伴冰雹","⛈️"],99:["强雷雨伴冰雹","⛈️"]
};

const cal={view:new Date(),selected:new Date()};
function renderCalendar(){
  const y=cal.view.getFullYear(),m=cal.view.getMonth();
  qs("#calendar-title").textContent=`${y} 年 ${m+1} 月`;
  const today=new Date();
  qs("#today-label").textContent=`今天 · ${today.getFullYear()}年${today.getMonth()+1}月${today.getDate()}日`;
  const first=new Date(y,m,1), start=(first.getDay()+6)%7;
  const days=new Date(y,m+1,0).getDate(), prevDays=new Date(y,m,0).getDate();
  const cells=[];
  for(let i=0;i<42;i++){
    let d,muted=false,cy=y,cm=m;
    if(i<start){d=prevDays-start+i+1;muted=true;cm=m-1;if(cm<0){cm=11;cy--;}}
    else if(i>=start+days){d=i-start-days+1;muted=true;cm=m+1;if(cm>11){cm=0;cy++;}}
    else d=i-start+1;
    const dt=new Date(cy,cm,d);
    const isToday=dt.toDateString()===today.toDateString();
    const isSelected=dt.toDateString()===cal.selected.toDateString();
    cells.push(`<button class="calendar-day ${muted?"muted":""} ${isToday?"today":""} ${isSelected?"selected":""}" data-date="${cy}-${cm+1}-${d}">${d}</button>`);
  }
  qs("#calendar-grid").innerHTML=cells.join("");
}qs("#prev-month").onclick=()=>{cal.view=new Date(cal.view.getFullYear(),cal.view.getMonth()-1,1);renderCalendar();};
qs("#next-month").onclick=()=>{cal.view=new Date(cal.view.getFullYear(),cal.view.getMonth()+1,1);renderCalendar();};
qs("#back-today").onclick=()=>{cal.view=new Date();cal.selected=new Date();renderCalendar();};
qs("#calendar-grid").onclick=e=>{
  const b=e.target.closest("[data-date]"); if(!b)return;
  const [y,m,d]=b.dataset.date.split("-").map(Number);
  cal.selected=new Date(y,m-1,d); cal.view=new Date(y,m-1,1); renderCalendar();
};
renderCalendar();

function updateLocalTimes(){
  const specs=[
    ["shijiazhuang","Asia/Shanghai"],
    ["auckland","Pacific/Auckland"]
  ];
  for(const [name,tz] of specs){
    const el=qs(`[data-city="${name}"] .local-time`);
    if(el) el.textContent=new Intl.DateTimeFormat("zh-CN",{timeZone:tz,hour:"2-digit",minute:"2-digit",hour12:false}).format(new Date());
  }
}
updateLocalTimes(); setInterval(updateLocalTimes,30000);

async function loadWeather(){
  try{
    const res=await fetch("/api/weather",{cache:"no-store"});
    if(!res.ok) throw new Error("weather");
    const data=await res.json();
    for(const [name,w] of Object.entries(data)){
      const card=qs(`[data-city="${name}"]`); if(!card)continue;
      const [desc,icon]=weatherCode[w.weather_code]||["天气变化中","🌤️"];
      qs(".temperature",card).textContent=Math.round(w.temperature_2m);
      qs(".weather-desc",card).textContent=desc;
      qs(".weather-icon",card).textContent=icon;
      qs(".feels",card).textContent=`体感 ${Math.round(w.apparent_temperature)}°`;
      qs(".wind",card).textContent=`风速 ${Math.round(w.wind_speed_10m)} km/h`;
    }
  }catch{
    qsa(".weather-desc").forEach(el=>el.textContent="天气暂时获取失败");
  }
}
loadWeather(); setInterval(loadWeather,10*60*1000);const canvas=qs("#family-board"),ctx=canvas.getContext("2d");
const empty=qs("#board-empty"),statusEl=qs("#sync-status");
let strokes=[],drawing=false,current=null,eraser=false,socket=null,retryTimer=null;
const clientId=crypto.randomUUID?.()||Math.random().toString(36).slice(2);
const ratio=()=>window.devicePixelRatio||1;
function resizeCanvas(){
  const rect=canvas.getBoundingClientRect(),dpr=ratio();
  canvas.width=Math.round(rect.width*dpr); canvas.height=Math.round(rect.height*dpr);
  ctx.setTransform(dpr,0,0,dpr,0,0); redraw();
}
function drawStroke(stroke){
  if(!stroke?.points?.length)return;
  const r=canvas.getBoundingClientRect();
  ctx.save(); ctx.lineCap="round"; ctx.lineJoin="round";
  ctx.strokeStyle=stroke.erase?"#fffdf8":stroke.color;
  ctx.globalCompositeOperation=stroke.erase?"destination-out":"source-over";
  ctx.lineWidth=stroke.size;
  ctx.beginPath();
  stroke.points.forEach((p,i)=>{
    const x=p[0]*r.width,y=p[1]*r.height;
    if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);
  });
  if(stroke.points.length===1){const [x,y]=stroke.points[0];ctx.lineTo(x*r.width+.01,y*r.height+.01);}
  ctx.stroke();ctx.restore();
}
function redraw(){
  const r=canvas.getBoundingClientRect();
  ctx.clearRect(0,0,r.width,r.height);
  strokes.forEach(drawStroke);
  empty.classList.toggle("hidden",strokes.length>0);
}
function pointFromEvent(e){
  const r=canvas.getBoundingClientRect();
  return[(e.clientX-r.left)/r.width,(e.clientY-r.top)/r.height];
}
function send(msg){if(socket?.readyState===WebSocket.OPEN)socket.send(JSON.stringify(msg));}
function setStatus(mode,text){
  statusEl.className="sync-status "+mode;statusEl.lastChild.textContent=text;
}function connectBoard(){
  clearTimeout(retryTimer);
  const proto=location.protocol==="https:"?"wss":"ws";
  socket=new WebSocket(`${proto}://${location.host}/api/board`);
  setStatus("","正在连接");
  socket.onopen=()=>setStatus("online","已实时同步");
  socket.onclose=()=>{setStatus("offline","连接中断，正在重连");retryTimer=setTimeout(connectBoard,1600);};
  socket.onerror=()=>socket.close();
  socket.onmessage=e=>{
    let msg;try{msg=JSON.parse(e.data)}catch{return}
    if(msg.type==="snapshot"){strokes=Array.isArray(msg.strokes)?msg.strokes:[];redraw();}
    if(msg.type==="stroke"&&msg.stroke){strokes.push(msg.stroke);drawStroke(msg.stroke);empty.classList.add("hidden");}
    if(msg.type==="segment"&&msg.clientId!==clientId&&msg.stroke)drawStroke(msg.stroke);
    if(msg.type==="clear"){strokes=[];redraw();}
  };
}
canvas.addEventListener("pointerdown",e=>{
  drawing=true;canvas.setPointerCapture(e.pointerId);
  const p=pointFromEvent(e);
  current={id:crypto.randomUUID?.()||Date.now().toString(36),color:qs("#pen-color").value,size:Number(qs("#pen-size").value),erase:eraser,points:[p]};
  drawStroke(current);empty.classList.add("hidden");
});
canvas.addEventListener("pointermove",e=>{
  if(!drawing||!current)return;
  const p=pointFromEvent(e),prev=current.points[current.points.length-1];
  current.points.push(p);
  const seg={...current,points:[prev,p]};
  drawStroke(seg);send({type:"segment",clientId,stroke:seg});
});
function finishStroke(){
  if(!drawing||!current)return;
  drawing=false;
  const done=current;current=null;
  strokes.push(done);send({type:"stroke",stroke:done});
}
canvas.addEventListener("pointerup",finishStroke);
canvas.addEventListener("pointercancel",finishStroke);
qs("#eraser-btn").onclick=()=>{
  eraser=!eraser;qs("#eraser-btn").classList.toggle("active",eraser);
  qs("#eraser-btn").textContent=eraser?"橡皮已开启":"橡皮";
};
qs("#clear-btn").onclick=()=>{
  if(confirm("确定要清空全家的涂鸦板吗？这个操作会同步给所有人。"))send({type:"clear"});
};
new ResizeObserver(resizeCanvas).observe(canvas);
connectBoard();