(function(){
var d=document.documentElement,tt=document.getElementById("tt"),nav=document.querySelector(".nav");
function paint(){if(tt)tt.textContent=d.dataset.theme==="light"?"\u263E":"\u2600"}
if(tt)tt.onclick=function(){var t=d.dataset.theme==="light"?"dark":"light";d.dataset.theme=t;try{localStorage.setItem("theme",t)}catch(e){}paint()};
paint();
function sc(){if(nav)nav.classList.toggle("sc",scrollY>8)}addEventListener("scroll",sc,{passive:true});sc();
var bg=document.getElementById("bg");
function closeMenu(){if(nav){nav.classList.remove("open");if(bg)bg.setAttribute("aria-expanded","false")}}
if(bg&&nav){bg.onclick=function(){var o=nav.classList.toggle("open");bg.setAttribute("aria-expanded",String(o))};
document.addEventListener("click",function(e){if(!nav.contains(e.target))closeMenu()});
addEventListener("keydown",function(e){if(e.key==="Escape")closeMenu()});
addEventListener("resize",function(){if(innerWidth>720)closeMenu()})}
function splitHeading(el){
  if(!el||matchMedia("(prefers-reduced-motion:reduce)").matches)return;
  var txt=el.textContent.trim(),k=0;el.setAttribute("aria-label",txt);el.textContent="";
  txt.split(" ").forEach(function(w){
    var ws=document.createElement("span");ws.className="w";ws.setAttribute("aria-hidden","true");
    w.split("").forEach(function(c){
      var s=document.createElement("span");s.className="ch";s.style.setProperty("--k",k++);s.textContent=c;ws.appendChild(s);
    });
    el.appendChild(ws);el.appendChild(document.createTextNode(" "));
  });
  el.classList.add("split");
}
document.querySelectorAll(".hero h1,.sim-hud h2,[data-split]").forEach(splitHeading);
if(!("IntersectionObserver" in window)||matchMedia("(prefers-reduced-motion:reduce)").matches)return;
var els=document.querySelectorAll(".hero .tag,.hero .lead,.hero .cta,.wrap>.lbl,.wrap h2,.wrap>.lead,.wrap .stage,.card,.feat li,.flow>*,footer .wrap,.sim-hud .lbl,.sim-hud .lead");
var io=new IntersectionObserver(function(es){es.forEach(function(e){if(!e.isIntersecting)return;var t=e.target;io.unobserve(t);t.classList.add("in");
t.addEventListener("transitionend",function f(ev){if(ev.target!==t)return;t.classList.remove("rv","in");t.style.removeProperty("--d");t.removeEventListener("transitionend",f)})})},{threshold:0.01});
var seen=new Map();
els.forEach(function(el){var p=el.parentElement,n=seen.get(p)||0;seen.set(p,n+1);el.style.setProperty("--d",Math.min(n,8)*.07+"s");el.classList.add("rv");io.observe(el)});
})();
