const qs=(s,r=document)=>r.querySelector(s);
const qsa=(s,r=document)=>[...r.querySelectorAll(s)];
const pad=n=>String(n).padStart(2,"0");
const dateKey=d=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const weatherCode={0:["晴朗","☀️"],1:["大致晴朗","🌤️"],2:["局部多云","⛅"],3:["阴天","☁️"],45:["有雾","🌫️"],48:["雾凇","🌫️"],51:["小毛毛雨","🌦️"],53:["毛毛雨","🌦️"],55:["较强毛毛雨","🌧️"],61:["小雨","🌦️"],63:["中雨","🌧️"],65:["大雨","🌧️"],71:["小雪","🌨️"],73:["中雪","🌨️"],75:["大雪","❄️"],80:["阵雨","🌦️"],81:["阵雨","🌧️"],82:["强阵雨","⛈️"],95:["雷雨","⛈️"],96:["雷雨伴冰雹","⛈️"],99:["强雷雨伴冰雹","⛈️"]};
const solarFestivals={"1-1":"元旦","5-1":"劳动节","6-1":"儿童节","10-1":"国庆节"};
const lunarFestivals={"正月-1":"春节","正月-15":"元宵节","五月-5":"端午节","七月-7":"七夕","八月-15":"中秋节","九月-9":"重阳节","腊月-8":"腊八节"};
const lunarDayNames=["","初一","初二","初三","初四","初五","初六","初七","初八","初九","初十","十一","十二","十三","十四","十五","十六","十七","十八","十九","二十","廿一","廿二","廿三","廿四","廿五","廿六","廿七","廿八","廿九","三十"];
const termNames=["小寒","大寒","立春","雨水","惊蛰","春分","清明","谷雨","立夏","小满","芒种","夏至","小暑","大暑","立秋","处暑","白露","秋分","寒露","霜降","立冬","小雪","大雪","冬至"];
const termInfo=[0,21208,42467,63836,85337,107014,128867,150921,173149,195551,218072,240693,263343,285989,308563,331033,353350,375494,397447,419210,440795,462224,483532,504758];

async function initPhotoLock(){
  try{
    const s=await fetch("/api/photo/status",{cache:"no-store"}).then(r=>r.json());
    if(s.unlocked)unlockPhotoView();
  }catch{}
}
function unlockPhotoView(){
  const img=qs("#family-photo"),lock=qs("#photo-lock");
  img.src="/api/photo/original?t="+Date.now();lock.classList.add("hidden");
}
qs("#photo-unlock-form").onsubmit=async e=>{
  e.preventDefault();const code=qs("#photo-code").value.trim(),err=qs("#photo-lock-error");
  err.textContent="正在验证…";
  const r=await fetch("/api/photo/unlock",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({code})});
  if(r.ok){err.textContent="";unlockPhotoView();}else{err.textContent="密码不正确，请再试一次";qs("#photo-code").select();}
};
initPhotoLock();function lunarInfo(date){
  const parts=new Intl.DateTimeFormat("zh-CN-u-ca-chinese",{month:"long",day:"numeric"}).formatToParts(date);
  const month=parts.find(p=>p.type==="month")?.value||"",day=Number(parts.find(p=>p.type==="day")?.value||0);
  return {month,day,label:day===1?month:(lunarDayNames[day]||String(day))};
}
function solarTerm(date){
  const y=date.getFullYear(),key=dateKey(date);if(y<1900||y>2100)return "";
  for(let i=0;i<24;i++){const ms=Date.UTC(1900,0,6,2,5)+31556925974.7*(y-1900)+termInfo[i]*60000,d=new Date(ms);if(`${y}-${pad(d.getUTCMonth()+1)}-${pad(d.getUTCDate())}`===key)return termNames[i];}
  return "";
}
function dayMeta(date){
  const lunar=lunarInfo(date),term=solarTerm(date),solar=solarFestivals[`${date.getMonth()+1}-${date.getDate()}`]||"";
  let lunarFest=lunarFestivals[`${lunar.month}-${lunar.day}`]||"";
  const tomorrow=new Date(date);tomorrow.setDate(date.getDate()+1);const next=lunarInfo(tomorrow);if(next.month==="正月"&&next.day===1)lunarFest="除夕";
  const festival=solar||lunarFest;return {lunar,term,festival,label:festival||term||lunar.label};
}
const cal={view:new Date(),selected:new Date()};
function renderCalendar(){
  const y=cal.view.getFullYear(),m=cal.view.getMonth(),today=new Date();
  qs("#calendar-title").textContent=`${y} 年 ${m+1} 月`;qs("#today-label").textContent=`今天 · ${today.getFullYear()}年${today.getMonth()+1}月${today.getDate()}日`;
  const first=new Date(y,m,1),start=(first.getDay()+6)%7,days=new Date(y,m+1,0).getDate(),prevDays=new Date(y,m,0).getDate(),cells=[];
  for(let i=0;i<42;i++){let d,muted=false,cy=y,cm=m;if(i<start){d=prevDays-start+i+1;muted=true;cm=m-1;if(cm<0){cm=11;cy--;}}else if(i>=start+days){d=i-start-days+1;muted=true;cm=m+1;if(cm>11){cm=0;cy++;}}else d=i-start+1;
    const dt=new Date(cy,cm,d),meta=dayMeta(dt),isToday=dateKey(dt)===dateKey(today),isSelected=dateKey(dt)===dateKey(cal.selected);
    cells.push(`<button class="calendar-day ${muted?"muted":""} ${isToday?"today":""} ${isSelected?"selected":""} ${meta.festival?"has-festival":""} ${meta.term?"has-term":""}" data-date="${dateKey(dt)}"><span class="solar-day">${d}</span><span class="lunar-day">${meta.label}</span></button>`);
  }
  qs("#calendar-grid").innerHTML=cells.join("");renderSelectedDay();
}function renderSelectedDay(){
  const d=cal.selected,m=dayMeta(d),week=["日","一","二","三","四","五","六"][d.getDay()],bits=[`农历${m.lunar.month}${m.lunar.day===1?"初一":m.lunar.label}`,m.term,m.festival].filter(Boolean);
  qs("#selected-day-detail").innerHTML=`<strong>${d.getMonth()+1}月${d.getDate()}日 · 星期${week}</strong>${bits.join(" · ")}`;
}
qs("#prev-month").onclick=()=>{cal.view=new Date(cal.view.getFullYear(),cal.view.getMonth()-1,1);renderCalendar();};
qs("#next-month").onclick=()=>{cal.view=new Date(cal.view.getFullYear(),cal.view.getMonth()+1,1);renderCalendar();};
qs("#back-today").onclick=()=>{cal.view=new Date();cal.selected=new Date();renderCalendar();loadWeather(cal.selected);};
qs("#calendar-grid").onclick=e=>{const b=e.target.closest("[data-date]");if(!b)return;const [y,m,d]=b.dataset.date.split("-").map(Number);cal.selected=new Date(y,m-1,d);if(cal.view.getMonth()!==m-1||cal.view.getFullYear()!==y)cal.view=new Date(y,m-1,1);renderCalendar();loadWeather(cal.selected);};
renderCalendar();
function updateLocalTimes(){for(const [name,tz] of [["shijiazhuang","Asia/Shanghai"],["auckland","Pacific/Auckland"]]){const el=qs(`[data-city="${name}"] .local-time`);if(el)el.textContent=new Intl.DateTimeFormat("zh-CN",{timeZone:tz,hour:"2-digit",minute:"2-digit",hour12:false}).format(new Date());}}
updateLocalTimes();setInterval(updateLocalTimes,30000);
let weatherRequest=0;
async function loadWeather(date){
  const req=++weatherRequest,key=dateKey(date),today=dateKey(new Date());qsa(".weather-card").forEach(c=>{c.classList.add("loading");c.classList.remove("unavailable");});
  qs("#weather-date-title").textContent=key===today?"今天":`${date.getFullYear()}年${date.getMonth()+1}月${date.getDate()}日`;qs("#weather-date-note").textContent=key===today?"当前天气":"历史 / 预报";
  try{const res=await fetch(`/api/weather?date=${key}`,{cache:"no-store"});if(req!==weatherRequest)return;const data=await res.json();if(!res.ok)throw new Error();
    for(const name of ["shijiazhuang","auckland"]){const card=qs(`[data-city="${name}"]`),w=data[name];card.classList.remove("loading");if(!w||w.unavailable){card.classList.add("unavailable");qs(".temperature",card).textContent="暂无";qs(".weather-desc",card).textContent=w?.reason||"暂无该日期天气数据";qs(".feels",card).textContent="";qs(".wind",card).textContent="";qs(".weather-icon",card).textContent="—";continue;}
      const [desc,icon]=weatherCode[w.weather_code]||["天气变化中","🌤️"];qs(".weather-icon",card).textContent=icon;
      if(w.mode==="current"){qs(".temperature",card).textContent=Math.round(w.temperature_2m);qs(".weather-desc",card).textContent=desc;qs(".feels",card).textContent=`体感 ${Math.round(w.apparent_temperature)}°`;qs(".wind",card).textContent=`风速 ${Math.round(w.wind_speed_10m)} km/h`;}
      else{qs(".temperature",card).textContent=`${Math.round(w.temperature_2m_min)}–${Math.round(w.temperature_2m_max)}`;qs(".weather-desc",card).textContent=desc;qs(".feels",card).textContent=`体感 ${Math.round(w.apparent_temperature_min)}–${Math.round(w.apparent_temperature_max)}°`;qs(".wind",card).textContent=`最大风速 ${Math.round(w.wind_speed_10m_max)} km/h`;}}
  }catch{if(req!==weatherRequest)return;qsa(".weather-card").forEach(card=>{card.classList.remove("loading");qs(".weather-desc",card).textContent="天气暂时获取失败";});}
}
loadWeather(cal.selected);const avatars=["🏡","👴","👵","👨","👩","🧑","👧","👦","🐶","🐱","🌻","❤️"];
const profileKey="family-home-profile-v1",visitorDayKey=()=>dateKey(new Date());
let profile=JSON.parse(localStorage.getItem(profileKey)||"null")||{id:crypto.randomUUID?.()||Math.random().toString(36).slice(2),name:"家人",avatar:"🏡"};
function renderProfile(){qs("#profile-name").value=profile.name;qs("#profile-avatar").textContent=profile.avatar;qs("#avatar-picker").innerHTML=avatars.map(a=>`<button class="avatar-choice ${a===profile.avatar?"active":""}" data-avatar="${a}">${a}</button>`).join("");}
qs("#avatar-picker").onclick=e=>{const b=e.target.closest("[data-avatar]");if(!b)return;profile.avatar=b.dataset.avatar;renderProfile();};
qs("#save-profile").onclick=async()=>{profile.name=(qs("#profile-name").value.trim()||"家人").slice(0,18);localStorage.setItem(profileKey,JSON.stringify(profile));renderProfile();await recordVisit();};
renderProfile();
const fmtTime=iso=>new Intl.DateTimeFormat("zh-CN",{month:"numeric",day:"numeric",hour:"2-digit",minute:"2-digit"}).format(new Date(iso));
function escapeHtml(s){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
function renderFamilyState(data){const visitors=data.visitors||[];qs("#visitor-count").textContent=`${visitors.length} 人`;qs("#visitor-list").innerHTML=visitors.length?visitors.map(v=>`<span class="visitor-chip"><span class="avatar">${v.avatar}</span>${escapeHtml(v.name)}</span>`).join(""):'<span class="message-empty">今天还没人留下脚印</span>';const messages=data.messages||[];qs("#message-list").innerHTML=messages.length?messages.slice().reverse().map(m=>`<article class="message-item"><span class="avatar">${m.avatar}</span><div><div class="message-head"><strong>${escapeHtml(m.name)}</strong><time>${fmtTime(m.createdAt)}</time></div><p class="message-text">${escapeHtml(m.text)}</p></div></article>`).join(""):'<div class="message-empty">还没有留言<br>写下第一句话吧 ♥</div>';}
async function loadFamilyState(){const r=await fetch(`/api/family?day=${visitorDayKey()}`,{cache:"no-store"});if(r.ok)renderFamilyState(await r.json());}
async function recordVisit(){await fetch("/api/family/visit",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({day:visitorDayKey(),profile})});}
qs("#message-input").addEventListener("input",e=>qs("#message-count").textContent=`${e.target.value.length} / 240`);
qs("#message-form").onsubmit=async e=>{e.preventDefault();const input=qs("#message-input"),text=input.value.trim();if(!text)return;const r=await fetch("/api/family/message",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({profile,text})});if(r.ok){input.value="";qs("#message-count").textContent="0 / 240";await loadFamilyState();}};
loadFamilyState();recordVisit();const canvas=qs("#family-board"),ctx=canvas.getContext("2d"),empty=qs("#board-empty"),statusEl=qs("#sync-status");
let strokes=[],drawing=false,current=null,eraser=false,socket=null,retryTimer=null,boards=[],currentBoard=localStorage.getItem("family-board-current")||"main";
const clientId=profile.id,ratio=()=>window.devicePixelRatio||1;
function resizeCanvas(){const rect=canvas.getBoundingClientRect(),dpr=ratio();canvas.width=Math.round(rect.width*dpr);canvas.height=Math.round(rect.height*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);redraw();}
function drawStroke(stroke){if(!stroke?.points?.length)return;const r=canvas.getBoundingClientRect();ctx.save();ctx.lineCap="round";ctx.lineJoin="round";ctx.strokeStyle=stroke.erase?"#fffdf8":stroke.color;ctx.globalCompositeOperation=stroke.erase?"destination-out":"source-over";ctx.lineWidth=stroke.size;ctx.beginPath();stroke.points.forEach((p,i)=>{const x=p[0]*r.width,y=p[1]*r.height;i?ctx.lineTo(x,y):ctx.moveTo(x,y);});if(stroke.points.length===1){const [x,y]=stroke.points[0];ctx.lineTo(x*r.width+.01,y*r.height+.01);}ctx.stroke();ctx.restore();}
function redraw(){const r=canvas.getBoundingClientRect();ctx.clearRect(0,0,r.width,r.height);strokes.forEach(drawStroke);empty.classList.toggle("hidden",strokes.length>0);}
function pointFromEvent(e){const r=canvas.getBoundingClientRect();return[(e.clientX-r.left)/r.width,(e.clientY-r.top)/r.height];}
function send(msg){if(socket?.readyState===WebSocket.OPEN)socket.send(JSON.stringify(msg));}
function setStatus(mode,text){statusEl.className="sync-status "+mode;statusEl.lastChild.textContent=text;}
async function loadBoards(prefer=currentBoard){
  const r=await fetch("/api/boards",{cache:"no-store"});if(!r.ok)return;boards=(await r.json()).boards||[];
  if(!boards.some(b=>b.id===prefer))prefer=boards[0]?.id||"main";currentBoard=prefer;localStorage.setItem("family-board-current",currentBoard);
  qs("#board-select").innerHTML=boards.map(b=>`<option value="${b.id}">${escapeHtml(b.name)}</option>`).join("");qs("#board-select").value=currentBoard;
}
function connectBoard(){
  clearTimeout(retryTimer);if(socket){socket.onclose=null;try{socket.close();}catch{}}
  strokes=[];redraw();const proto=location.protocol==="https:"?"wss":"ws";socket=new WebSocket(`${proto}://${location.host}/api/board?board=${encodeURIComponent(currentBoard)}`);setStatus("","正在连接");
  socket.onopen=()=>setStatus("online","已实时同步");socket.onclose=()=>{setStatus("offline","连接中断，正在重连");retryTimer=setTimeout(connectBoard,1600);};socket.onerror=()=>socket.close();
  socket.onmessage=e=>{let msg;try{msg=JSON.parse(e.data)}catch{return}if(msg.type==="snapshot"){strokes=Array.isArray(msg.strokes)?msg.strokes:[];redraw();}if(msg.type==="stroke"&&msg.stroke){strokes.push(msg.stroke);drawStroke(msg.stroke);empty.classList.add("hidden");}if(msg.type==="segment"&&msg.clientId!==clientId&&msg.stroke)drawStroke(msg.stroke);if(msg.type==="clear"){strokes=[];redraw();}if(msg.type==="family-update")loadFamilyState();if(msg.type==="boards-update")loadBoards(currentBoard);};
}qs("#board-select").onchange=e=>{currentBoard=e.target.value;localStorage.setItem("family-board-current",currentBoard);connectBoard();};
qs("#new-board-btn").onclick=async()=>{const name=prompt("给新画板起个名字：",`家庭画板 ${boards.length+1}`);if(name===null)return;const r=await fetch("/api/boards",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({name:name.trim()})});if(!r.ok){alert("新建画板失败");return;}const {board}=await r.json();await loadBoards(board.id);connectBoard();};
canvas.addEventListener("pointerdown",e=>{drawing=true;canvas.setPointerCapture(e.pointerId);const p=pointFromEvent(e);current={id:crypto.randomUUID?.()||Date.now().toString(36),color:qs("#pen-color").value,size:Number(qs("#pen-size").value),erase:eraser,points:[p]};drawStroke(current);empty.classList.add("hidden");});
canvas.addEventListener("pointermove",e=>{if(!drawing||!current)return;const p=pointFromEvent(e),prev=current.points[current.points.length-1];current.points.push(p);const seg={...current,points:[prev,p]};drawStroke(seg);send({type:"segment",clientId,stroke:seg});});
function finishStroke(){if(!drawing||!current)return;drawing=false;const done=current;current=null;strokes.push(done);send({type:"stroke",stroke:done});}
canvas.addEventListener("pointerup",finishStroke);canvas.addEventListener("pointercancel",finishStroke);
qs("#eraser-btn").onclick=()=>{eraser=!eraser;qs("#eraser-btn").classList.toggle("active",eraser);qs("#eraser-btn").textContent=eraser?"橡皮已开启":"橡皮";};
qs("#clear-btn").onclick=()=>{const b=boards.find(x=>x.id===currentBoard);if(confirm(`确定要清空“${b?.name||"当前画板"}”吗？这个操作会同步给所有人。`))send({type:"clear"});};
new ResizeObserver(resizeCanvas).observe(canvas);
(async()=>{await loadBoards();connectBoard();})();