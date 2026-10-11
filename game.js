// ============================================================
// BUBS VS. THE WORLD — game engine
// ============================================================
(function(){
"use strict";

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
ctx.imageSmoothingEnabled = false;

const VIEW_W = 960, VIEW_H = 540;
// Tuned for a generous, forgiving jump: max height ~195px, max horizontal
// reach during a jump ~240px, so gaps and platform heights in the level
// data below are built to stay safely inside those bounds.
const GRAVITY = 1500;
const MOVE_SPEED = 250;
const JUMP_VELOCITY = -765;
const GROUND_FRICTION = 0.82;

// ---------- Screen management ----------
const screens = {
  title: document.getElementById('titleScreen'),
  instructions: document.getElementById('instructionsScreen'),
  game: document.getElementById('gameScreen'),
};
function showScreen(name){
  Object.values(screens).forEach(s=>s.classList.add('hidden'));
  screens[name].classList.remove('hidden');
}

document.getElementById('startBtn').addEventListener('click', ()=>{
  showScreen('instructions');
});
document.getElementById('playBtn').addEventListener('click', ()=>{
  showScreen('game');
  resizeCanvas();
  startGame();
});

// ---------- Resize handling ----------
function resizeCanvas(){
  const root = document.getElementById('gameRoot');
  const frame = document.getElementById('gameFrame');
  const maxW = root.clientWidth;
  const maxH = root.clientHeight;
  // On narrow/portrait screens, let the frame use most of the available
  // width even if that means it's taller than it is wide relative to the
  // 960x540 world — the frame keeps the world's aspect ratio, so it still
  // ends up as a centered landscape strip, just a larger one.
  const scale = Math.min(maxW / VIEW_W, maxH / VIEW_H);
  const w = VIEW_W*scale, h = VIEW_H*scale;
  frame.style.width = w+'px';
  frame.style.height = h+'px';
}
window.addEventListener('resize', resizeCanvas);

// ---------- Audio (WebAudio, generated, lazy) ----------
let audioCtx = null, muted = false;
function ensureAudio(){
  if(!audioCtx){
    try{ audioCtx = new (window.AudioContext||window.webkitAudioContext)(); }catch(e){}
  }
}
function beep(freq, dur, type, vol){
  if(muted || !audioCtx) return;
  try{
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = type || 'sine';
    o.frequency.value = freq;
    g.gain.value = (vol!==undefined?vol:0.15);
    o.connect(g); g.connect(audioCtx.destination);
    const t = audioCtx.currentTime;
    g.gain.setValueAtTime(g.gain.value, t);
    g.gain.exponentialRampToValueAtTime(0.001, t+dur);
    o.start(t); o.stop(t+dur);
  }catch(e){}
}
const SFX = {
  jump:()=>beep(520,0.12,'square',0.12),
  attack:()=>beep(300,0.08,'sawtooth',0.1),
  hit:()=>beep(150,0.15,'square',0.14),
  heart:()=>{beep(700,0.08,'sine',0.14); setTimeout(()=>beep(900,0.1,'sine',0.12),60);},
  defeat:()=>{beep(220,0.1,'triangle',0.12); setTimeout(()=>beep(180,0.15,'triangle',0.1),90);},
  portal:()=>{beep(440,0.1,'sine',0.12); setTimeout(()=>beep(660,0.15,'sine',0.12),100); setTimeout(()=>beep(880,0.2,'sine',0.12),220);},
  bossAppear:()=>{beep(120,0.3,'sawtooth',0.15); setTimeout(()=>beep(100,0.3,'sawtooth',0.15),200);},
  victory:()=>{[523,659,784,1046].forEach((f,i)=>setTimeout(()=>beep(f,0.18,'sine',0.14), i*120));},
  love:()=>{beep(880,0.1,'sine',0.14); setTimeout(()=>beep(1046,0.15,'sine',0.13),90);},
};
document.getElementById('muteBtn').addEventListener('click', (e)=>{
  muted = !muted;
  e.target.textContent = muted ? '🔇' : '🔊';
});
window.addEventListener('pointerdown', ensureAudio, {once:true});
window.addEventListener('keydown', ensureAudio, {once:true});

// ---------- Input ----------
const keys = {};
const touch = {left:false,right:false,jump:false,attack:false,special:false};
window.addEventListener('keydown', (e)=>{
  if(['ArrowLeft','ArrowRight','ArrowUp',' '].includes(e.key)) e.preventDefault();
  keys[e.key.toLowerCase()] = true;
  if(e.key==='Escape') togglePause();
});
window.addEventListener('keyup', (e)=>{ keys[e.key.toLowerCase()] = false; });

function bindTouch(id, prop){
  const el = document.getElementById(id);
  const on = (e)=>{ e.preventDefault(); touch[prop]=true; el.classList.add('active'); };
  const off = (e)=>{ e.preventDefault(); touch[prop]=false; el.classList.remove('active'); };
  el.addEventListener('pointerdown', on);
  el.addEventListener('pointerup', off);
  el.addEventListener('pointercancel', off);
  el.addEventListener('pointerleave', off);
}
bindTouch('btnLeft','left'); bindTouch('btnRight','right');
bindTouch('btnJump','jump'); bindTouch('btnAttack','attack'); bindTouch('btnSpecial','special');

function isLeft(){ return keys['arrowleft']||keys['a']||touch.left; }
function isRight(){ return keys['arrowright']||keys['d']||touch.right; }
function isJumpPressed(){ return keys['arrowup']||keys['w']||keys[' ']||touch.jump; }
function isAttackPressed(){ return keys['z']||keys['j']||touch.attack; }
function isSpecialPressed(){ return keys['x']||keys['k']||touch.special; }

// ---------- Utility ----------
function rectsOverlap(a,b){
  return a.x < b.x+b.w && a.x+a.w > b.x && a.y < b.y+b.h && a.y+a.h > b.y;
}
function clamp(v,lo,hi){ return Math.max(lo, Math.min(hi, v)); }
function rand(a,b){ return a + Math.random()*(b-a); }
function choice(arr){ return arr[Math.floor(Math.random()*arr.length)]; }

// ---------- Floating messages ----------
const floatMsgsEl = document.getElementById('floatMsgs');
function floatMsg(text){
  const d = document.createElement('div');
  d.className = 'floatMsg';
  d.textContent = text;
  floatMsgsEl.appendChild(d);
  setTimeout(()=>d.remove(), 1600);
}

// ---------- Particles ----------
let particles = [];
function spawnParticles(x,y,color,count,opts){
  opts = opts||{};
  for(let i=0;i<count;i++){
    particles.push({
      x, y, vx: rand(-120,120), vy: rand(-180,-40),
      life: rand(0.4,0.9), age:0, color, size: opts.size||rand(2,4), shape: opts.shape||'rect'
    });
  }
}
function updateParticles(dt){
  for(let i=particles.length-1;i>=0;i--){
    const p = particles[i];
    p.age += dt;
    if(p.age>p.life){ particles.splice(i,1); continue; }
    p.vy += GRAVITY*0.4*dt;
    p.x += p.vx*dt; p.y += p.vy*dt;
  }
}
function drawParticles(cam){
  particles.forEach(p=>{
    const alpha = clamp(1-(p.age/p.life),0,1);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = p.color;
    if(p.shape==='star'){
      drawStar(p.x-cam.x, p.y-cam.y, p.size);
    } else {
      ctx.fillRect(p.x-cam.x, p.y-cam.y, p.size, p.size);
    }
  });
  ctx.globalAlpha = 1;
}
function drawStar(x,y,s){
  ctx.save();
  ctx.translate(x,y);
  ctx.beginPath();
  for(let i=0;i<5;i++){
    const ang = -Math.PI/2 + i*(Math.PI*2/5);
    ctx.lineTo(Math.cos(ang)*s, Math.sin(ang)*s);
    const ang2 = ang + Math.PI/5;
    ctx.lineTo(Math.cos(ang2)*s*0.4, Math.sin(ang2)*s*0.4);
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawHeart(x,y,size,color){
  ctx.fillStyle = color||'#ff5577';
  ctx.save();
  ctx.translate(x,y);
  const s = size/10;
  ctx.beginPath();
  ctx.moveTo(0, 3*s);
  ctx.bezierCurveTo(-6*s,-4*s, -10*s,2*s, 0,8*s);
  ctx.bezierCurveTo(10*s,2*s, 6*s,-4*s, 0,3*s);
  ctx.fill();
  ctx.restore();
}

// ============================================================
// SPRITES — procedural pixel-art drawing (all drawn with simple
// rectangles/shapes onto an offscreen pixel grid, then blitted)
// ============================================================
function makePixelSprite(w,h,drawFn){
  const off = document.createElement('canvas');
  off.width = w; off.height = h;
  const octx = off.getContext('2d');
  drawFn(octx,w,h);
  return off;
}

const PAL = {
  skin:'#ffd9b3', skinShadow:'#e8b98c', hairPink:'#ff8fb0', hairDark:'#e8628f',
  outfitPink:'#ff6f91', outfitDark:'#d14b7a', white:'#fff6ea', eyeDark:'#4a3b36',
  cloudGray:'#cfd6e0', cloudDark:'#a8b3c2', ghostWhite:'#eef0ff', ghostShadow:'#c9c9ea',
  sleepyBrown:'#b98a6a', sleepyDark:'#8a5a44', boyShirt:'#aee4ff', boyShirtDark:'#7fbfe0',
  boyHair:'#5a3b2e', boyPants:'#6b4a40'
};

// Bubs sprite sheet: idle, walk(2 frames), jump, attack, hurt, victory
function drawBubsFrame(o, frame, facing){
  // frame: 'idle','walk0','walk1','jump','attack','hurt','victory'
  const c = o;
  c.clearRect(0,0,32,32);
  c.save();
  if(facing<0){ c.translate(32,0); c.scale(-1,1); }
  // bob offset
  let bob = 0, legSpread=0, armAngle=0, blush=true;
  if(frame==='walk0'){ bob=1; legSpread=3; }
  if(frame==='walk1'){ bob=0; legSpread=-3; }
  if(frame==='jump'){ bob=-2; legSpread=0; }
  if(frame==='attack'){ armAngle=1; }
  if(frame==='hurt'){ bob=1; }
  if(frame==='victory'){ bob=-3; }
  // hair back
  c.fillStyle = PAL.hairDark;
  c.fillRect(7,6+bob,18,8);
  // body/outfit (dress)
  c.fillStyle = PAL.outfitPink;
  c.fillRect(10,16+bob,12,10);
  c.fillStyle = PAL.outfitDark;
  c.fillRect(10,24+bob,12,3);
  // legs
  c.fillStyle = PAL.skin;
  c.fillRect(11+legSpread,27+bob,4,4);
  c.fillRect(17-legSpread,27+bob,4,4);
  // arms
  c.fillStyle = PAL.outfitPink;
  if(frame==='attack'){
    c.fillRect(21,15+bob,9,4); // punch arm extended
  } else {
    c.fillRect(8,17+bob,3,7);
    c.fillRect(21,17+bob,3,7);
  }
  // head
  c.fillStyle = PAL.skin;
  c.fillRect(9,5+bob,14,12);
  // hair front/bangs
  c.fillStyle = PAL.hairPink;
  c.fillRect(7,3+bob,18,6);
  c.fillRect(7,8+bob,4,6);
  c.fillRect(21,8+bob,4,6);
  // face
  if(frame==='hurt'){
    c.fillStyle = PAL.eyeDark;
    c.fillRect(12,11+bob,2,1); c.fillRect(18,11+bob,2,1);
    c.fillStyle='#fff';
    c.fillRect(12,10+bob,2,1); c.fillRect(18,10+bob,2,1);
  } else if(frame==='victory'){
    c.fillStyle = PAL.eyeDark;
    c.fillRect(12,10+bob,2,2); c.fillRect(18,10+bob,2,2);
    c.fillRect(13,13+bob,6,1);
  } else {
    c.fillStyle = PAL.eyeDark;
    c.fillRect(12,10+bob,2,2);
    c.fillRect(18,10+bob,2,2);
    c.fillRect(14,13+bob,4,1);
  }
  if(blush){
    c.fillStyle = 'rgba(255,120,150,0.5)';
    c.fillRect(10,12+bob,2,1);
    c.fillRect(20,12+bob,2,1);
  }
  c.restore();
}
const bubsFrames = {};
['idle','walk0','walk1','jump','attack','hurt','victory'].forEach(f=>{
  bubsFrames[f+'_r'] = makePixelSprite(32,32,(o)=>drawBubsFrame(o,f,1));
  bubsFrames[f+'_l'] = makePixelSprite(32,32,(o)=>drawBubsFrame(o,f,-1));
});

// Boyfriend sprite
function drawBoyFrame(o, frame, facing){
  const c = o;
  c.clearRect(0,0,36,40);
  c.save();
  if(facing<0){ c.translate(36,0); c.scale(-1,1); }
  let bob=0, armUp=false, flop=false;
  if(frame==='idle'){ bob = Math.sin(Date.now()/300)*0; }
  if(frame==='attack'){ armUp=true; }
  if(frame==='hurt'){ bob=2; }
  if(frame==='defeat'){ flop=true; }
  if(flop){
    // lying down
    c.fillStyle = PAL.boyPants;
    c.fillRect(4,30,28,6);
    c.fillStyle = PAL.boyShirt;
    c.fillRect(6,22,22,8);
    c.fillStyle = PAL.skin;
    c.fillRect(2,20,10,10);
    c.fillStyle = PAL.boyHair;
    c.fillRect(0,18,10,5);
    c.restore();
    return;
  }
  // legs
  c.fillStyle = PAL.boyPants;
  c.fillRect(10,30+bob,6,8);
  c.fillRect(20,30+bob,6,8);
  // body
  c.fillStyle = PAL.boyShirt;
  c.fillRect(8,16+bob,20,16);
  c.fillStyle = PAL.boyShirtDark;
  c.fillRect(8,28+bob,20,4);
  // arms
  c.fillStyle = PAL.skin;
  if(armUp){
    c.fillRect(26,8+bob,5,12);
    c.fillRect(3,18+bob,5,10);
  } else {
    c.fillRect(4,18+bob,5,10);
    c.fillRect(27,18+bob,5,10);
  }
  // head
  c.fillStyle = PAL.skin;
  c.fillRect(9,4+bob,18,14);
  // hair
  c.fillStyle = PAL.boyHair;
  c.fillRect(7,1+bob,22,7);
  c.fillRect(7,6+bob,4,6);
  // face — comically overconfident
  c.fillStyle = PAL.eyeDark;
  c.fillRect(13,11+bob,2,2);
  c.fillRect(21,11+bob,2,2);
  if(frame==='hurt'){
    c.fillRect(14,16+bob,8,1);
  } else {
    // smug smile
    c.fillRect(14,15+bob,2,1); c.fillRect(16,16+bob,4,1); c.fillRect(20,15+bob,2,1);
  }
  c.restore();
}
const boyFrames = {};
['idle','attack','hurt','defeat'].forEach(f=>{
  boyFrames[f+'_r'] = makePixelSprite(36,40,(o)=>drawBoyFrame(o,f,1));
  boyFrames[f+'_l'] = makePixelSprite(36,40,(o)=>drawBoyFrame(o,f,-1));
});

// Enemy sprites
function drawCloud(c, angry){
  c.clearRect(0,0,28,22);
  c.fillStyle = PAL.cloudGray;
  c.fillRect(2,8,24,10);
  c.fillRect(5,4,10,8);
  c.fillRect(14,3,10,10);
  c.fillStyle = PAL.cloudDark;
  c.fillRect(2,16,24,3);
  // eyebrows angry
  c.fillStyle = '#555';
  c.fillRect(7,10,5,2);
  c.fillRect(16,10,5,2);
  c.save(); c.translate(9,12); c.rotate(-0.3); c.fillRect(-2,-1,4,2); c.restore();
  c.save(); c.translate(19,12); c.rotate(0.3); c.fillRect(-2,-1,4,2); c.restore();
  c.fillStyle='#333';
  c.fillRect(8,13,2,2); c.fillRect(18,13,2,2);
}
const cloudSprite = makePixelSprite(28,22,drawCloud);

function drawGhost(c){
  c.clearRect(0,0,22,26);
  c.fillStyle = PAL.ghostWhite;
  c.fillRect(4,2,14,16);
  c.fillRect(2,8,18,10);
  c.beginPath();
  c.fillRect(2,16,4,6); c.fillRect(8,16,4,8); c.fillRect(14,16,4,6);
  c.fillStyle = PAL.ghostShadow;
  c.fillRect(4,16,14,2);
  c.fillStyle = '#6b6ba0';
  c.fillRect(7,9,3,4); c.fillRect(13,9,3,4);
  c.fillStyle='#fff';
  c.fillRect(8,9,1,1); c.fillRect(14,9,1,1);
  c.fillRect(9,15,4,1);
}
const ghostSprite = makePixelSprite(22,26,drawGhost);

function drawSleepy(c){
  c.clearRect(0,0,30,20);
  c.fillStyle = PAL.sleepyBrown;
  c.fillRect(2,8,22,10);
  c.fillRect(6,4,14,8);
  c.fillStyle = PAL.sleepyDark;
  c.fillRect(2,16,22,2);
  c.fillStyle = '#fff';
  c.fillRect(22,2,7,7); // pillow
  c.fillStyle = '#4a3b36';
  c.fillRect(9,8,2,1); c.fillRect(16,8,2,1); // sleepy closed eyes
  c.fillStyle='#8a5a44';
  c.fillRect(12,11,4,1);
}
const sleepySprite = makePixelSprite(30,20,drawSleepy);

// ============================================================
// ENTITIES
// ============================================================
class Entity{
  constructor(x,y,w,h){
    this.x=x; this.y=y; this.w=w; this.h=h;
    this.vx=0; this.vy=0;
  }
  get rect(){ return {x:this.x,y:this.y,w:this.w,h:this.h}; }
}

class Player extends Entity{
  constructor(x,y){
    super(x,y,24,30);
    this.maxHealth = 3; this.health = 3;
    this.facing = 1;
    this.onGround = false;
    this.invuln = 0;
    this.attackCooldown = 0;
    this.attackActiveTimer = 0;
    this.animTimer = 0; this.walkFrame = 0;
    this.state = 'idle'; // idle, walk, jump, attack, hurt, victory
    this.hearts = 0;
    this.loveCharge = 0; // 0..100
    this.specialReady = false;
    this.knockbackTimer = 0;
    this.dead = false;
    this.victoryPose = false;
  }
  takeDamage(amount, fromX){
    if(this.invuln>0 || this.dead) return;
    this.health -= amount;
    this.invuln = 1.6;
    this.knockbackTimer = 0.2;
    this.vx = (this.x < fromX ? -1:1) * 160;
    this.vy = -140;
    this.state = 'hurt';
    SFX.hit();
    if(this.health<=0){
      this.health = 0;
      this.dead = true;
    }
    updateHUD();
  }
  addHeart(){
    this.hearts++;
    this.loveCharge = Math.min(100, this.loveCharge + 20);
    if(this.loveCharge>=100) this.specialReady = true;
    updateHUD();
  }
}

// ---------- Enemy base ----------
class Enemy extends Entity{
  constructor(x,y,w,h,opts){
    super(x,y,w,h);
    this.health = opts.health||2;
    this.maxHealth = this.health;
    this.speed = opts.speed||40;
    this.dir = 1;
    this.type = opts.type;
    this.range = opts.range || [x-60, x+60];
    this.dead = false;
    this.hitFlash = 0;
    this.wanderTimer = rand(0,2);
    this.deathPlayed=false;
  }
  // Slightly smaller than the full sprite box, used only for the
  // enemy-touches-player damage check — keeps contact damage from
  // firing on a grazing near-miss.
  get hurtRect(){
    const inset = 5;
    return {x:this.x+inset, y:this.y+inset, w:Math.max(2,this.w-inset*2), h:Math.max(2,this.h-inset*2)};
  }
  takeHit(dmg){
    if(this.dead) return;
    this.health -= dmg;
    this.hitFlash = 0.15;
    if(this.health<=0){
      this.dead = true;
      SFX.defeat();
      const colors = {stress:'#fde68a',overthinking:'#c9c9ea',exhaustion:'#d8b48a'};
      spawnParticles(this.x+this.w/2, this.y+this.h/2, colors[this.type]||'#fff', 14, {shape:'star', size:4});
      floatMsg(DEFEAT_MSG[this.type]);
    }
  }
  update(dt, world){
    if(this.dead) return;
    this.wanderTimer -= dt;
    if(this.wanderTimer<=0){
      this.wanderTimer = rand(1.2,2.5);
    }
    this.x += this.dir*this.speed*dt;
    if(this.x < this.range[0]){ this.x = this.range[0]; this.dir=1; }
    if(this.x+this.w > this.range[1]){ this.x = this.range[1]-this.w; this.dir=-1; }
    if(this.hitFlash>0) this.hitFlash -= dt;
  }
}
const DEFEAT_MSG = {
  stress:'STRESS HAS LEFT THE CHAT.',
  overthinking:'BRAIN TAB CLOSED. 🧠',
  exhaustion:'PLEASE LET BUBS REST. 😭',
};

// ---------- Collectible ----------
class Heart extends Entity{
  constructor(x,y){
    super(x,y,16,16);
    this.collected=false;
    this.bob = rand(0,Math.PI*2);
  }
}

// ---------- Projectile ----------
class Projectile extends Entity{
  constructor(x,y,vx,vy,w,h,kind,owner){
    super(x,y,w,h);
    this.vx=vx; this.vy=vy; this.kind=kind; this.owner=owner; this.life=3; this.dead=false;
  }
}

// ============================================================
// LEVEL DATA
// ============================================================
function makeGroundSegments(segs){
  // segs: array of {x,w,y} top surfaces (y = top of ground)
  return segs;
}

function buildLevel1(){
  const groundY = 460;
  return {
    name:'LEVEL 1: TOO MUCH EVERYTHING',
    intro:['Bubs woke up and the world decided to be a little too much today.','Time to bonk some nonsense.'],
    width: 2600,
    bg:'level1',
    platforms:[
      {x:0,y:groundY,w:700,h:80},
      {x:800,y:groundY,w:300,h:80},
      {x:1200,y:groundY,w:260,h:80},
      {x:1550,y:groundY,w:650,h:80},
      {x:2300,y:groundY,w:300,h:80},
      // floating platforms
      {x:380,y:360,w:120,h:20},
      {x:950,y:340,w:110,h:20},
      {x:1300,y:300,w:100,h:20},
      {x:1750,y:360,w:140,h:20},
      {x:2050,y:300,w:120,h:20},
    ],
    hearts:[
      [250,400],[500,310],[1000,300],[1330,270],[1800,310],[2100,270],[2400,400],[900,400],[1650,400]
    ],
    enemies:[
      {type:'stress', x:420, range:[350,620], y:groundY-26},
      {type:'overthinking', x:1000, range:[950,1180], y:groundY-30},
      {type:'exhaustion', x:1700, range:[1600,1950], y:groundY-22},
    ],
    exit:{x:2500,y:groundY-70,w:50,h:70},
    groundY
  };
}
function buildLevel2(){
  const groundY = 460;
  return {
    name:'LEVEL 2: ABSOLUTELY NOT TODAY',
    intro:['WHO AUTHORIZED THIS?','BONK FIRST. ASK QUESTIONS LATER.'],
    width: 2800,
    bg:'level2',
    platforms:[
      {x:0,y:groundY,w:500,h:80},
      {x:650,y:groundY,w:250,h:80},
      {x:1100,y:groundY,w:300,h:80},
      {x:1650,y:groundY,w:250,h:80},
      {x:2100,y:groundY,w:700,h:80},
      {x:300,y:340,w:100,h:20},
      {x:600,y:260,w:100,h:20,moving:{axis:'x',range:[600,900],speed:60}},
      {x:1000,y:380,w:90,h:20},
      {x:1300,y:280,w:100,h:20,moving:{axis:'y',range:[220,340],speed:50}},
      // bridge platforms so the two widest ground gaps are never a single
      // all-or-nothing jump
      {x:1500,y:360,w:100,h:20},
      {x:1980,y:380,w:100,h:20},
      {x:1750,y:320,w:110,h:20},
      {x:2250,y:280,w:120,h:20},
      {x:2500,y:360,w:100,h:20},
    ],
    hearts:[
      [150,400],[650,230],[1040,330],[1340,250],[1780,290],[2000,420],[2300,250],[2600,310],[1450,420]
    ],
    secretHeart:[1460,150],
    enemies:[
      {type:'stress', x:500, range:[400,780], y:groundY-26},
      {type:'overthinking', x:1150, range:[1050,1380], y:groundY-30},
      {type:'exhaustion', x:1700, range:[1650,1880], y:groundY-22},
      {type:'overthinking', x:2300, range:[2150,2550], y:groundY-30},
    ],
    signs:[{x:1420,y:groundY-40,text:'YOU ARE DOING AMAZING, BUBS.'}],
    floatingMsgs:['YOUR MAN IS CHEERING FOR YOU.','PLEASE COLLECT YOUR COMPLIMENTS.'],
    exit:{x:2700,y:groundY-70,w:50,h:70},
    groundY
  };
}
function buildLevel3(){
  const groundY = 460;
  return {
    name:'LEVEL 3: THE LAST STRAW',
    intro:["Just one more stretch of nonsense, Bubs.","You've got this."],
    width: 2400,
    bg:'level3',
    platforms:[
      {x:0,y:groundY,w:500,h:80},
      {x:620,y:groundY,w:260,h:80},
      {x:1000,y:groundY,w:260,h:80},
      {x:1380,y:groundY,w:260,h:80},
      {x:1760,y:groundY,w:640,h:80},
      {x:300,y:340,w:100,h:20},
      {x:700,y:280,w:100,h:20},
      {x:1050,y:340,w:100,h:20,moving:{axis:'x',range:[1050,1250],speed:70}},
      {x:1450,y:260,w:100,h:20},
      {x:1900,y:320,w:120,h:20},
    ],
    hearts:[
      [200,400],[720,250],[1080,300],[1480,230],[1950,290],[2100,400],[850,400]
    ],
    enemies:[
      {type:'stress', x:650, range:[600,860], y:groundY-26},
      {type:'exhaustion', x:1050, range:[1000,1250], y:groundY-22},
      {type:'overthinking', x:1450, range:[1380,1630], y:groundY-30},
    ],
    exit:{x:2300,y:groundY-70,w:50,h:70, mystery:true},
    groundY
  };
}

// ============================================================
// GAME STATE
// ============================================================
let camera = {x:0,y:0};
let world = null;
let player = null;
let enemies = [];
let heartsList = [];
let projectiles = [];
let currentLevelIndex = 0;
const levels = [buildLevel1, buildLevel2, buildLevel3];
let levelComplete = false;
let paused = false;
let gameOverFlag = false;
let introShown = false;
let introQueue = [];
let gameStarted = false;
let lastTime = 0;
let animFrameId = null;
let bonusUnlocked = false;
let inBossFight = false;
let secretHeartCollected = false;
let signTouched = {};

function updateHUD(){
  document.getElementById('heartsDisplay').textContent = '❤️'.repeat(Math.max(0,player.health)) + '🖤'.repeat(Math.max(0,player.maxHealth-player.health));
  document.getElementById('heartCount').textContent = player.hearts;
  document.getElementById('loveMeterFill').style.width = (player.loveCharge)+'%';
  if(player.specialReady){
    document.getElementById('loveMeterFill').style.background = 'linear-gradient(90deg,#ff5fa0,#ff2d78)';
  }
}

function setLevelLabel(text){
  document.getElementById('levelLabel').textContent = text;
}

// ---------- Level loading ----------
function loadLevel(idx){
  currentLevelIndex = idx;
  world = levels[idx]();
  player = new Player(60, world.groundY-30);
  enemies = world.enemies.map(e=>new Enemy(e.x, e.y, e.type==='overthinking'?20:28, e.type==='overthinking'?26:22, {type:e.type, range:e.range, speed: e.type==='stress'?30:e.type==='overthinking'?40:22, health: 2}));
  heartsList = world.hearts.map(h=>new Heart(h[0],h[1]));
  if(world.secretHeart && !secretHeartCollected){
    heartsList.push(new Heart(world.secretHeart[0], world.secretHeart[1]));
  }
  projectiles = [];
  levelComplete = false;
  gameOverFlag = false;
  deathHandled = false;
  camera.x = 0; camera.y = 0;
  setLevelLabel(world.name);
  introQueue = world.intro.slice();
  showIntroQueue();
  updateHUD();
}

function showIntroQueue(){
  if(introQueue.length===0){ hideCinematic(); return; }
  const panel = document.getElementById('cinematicPanel');
  const textEl = document.getElementById('cinematicText');
  panel.classList.remove('hidden');
  textEl.textContent = introQueue.shift();
  paused = true;
  setTimeout(()=>{
    if(introQueue.length>0){ showIntroQueue(); }
    else { hideCinematic(); paused=false; }
  }, 1800);
}
function hideCinematic(){
  document.getElementById('cinematicPanel').classList.add('hidden');
}

// ---------- Platform collision ----------
function movingPlatformPos(p, t){
  if(!p.moving) return {x:p.x,y:p.y};
  const m = p.moving;
  const phase = (Math.sin(t*m.speed*0.02))*0.5+0.5;
  if(m.axis==='x'){
    return {x: m.range[0] + phase*(m.range[1]-m.range[0]), y:p.y};
  } else {
    return {x:p.x, y: m.range[0] + phase*(m.range[1]-m.range[0])};
  }
}

function resolvePlatformCollisions(entity, dt, t){
  entity.onGround = false;
  for(const p of world.platforms){
    const pos = movingPlatformPos(p, t);
    const rect = {x:pos.x,y:pos.y,w:p.w,h:p.h};
    // Only treat top surface as solid (one-way-ish but simple AABB works fine for platformer feel).
    // Landing is detected with a generous tolerance band around the platform's
    // top surface (rather than reconstructing an exact previous-frame bottom),
    // so a fast fall or a slightly-too-deep step doesn't whiff the landing.
    if(entity.x+entity.w > rect.x+4 && entity.x < rect.x+rect.w-4){
      const feetY = entity.y+entity.h;
      if(entity.vy>=0 && feetY >= rect.y-6 && feetY <= rect.y+22){
        if(p.moving && p.moving.axis==='x'){
          const prevPos = movingPlatformPos(p, t-dt);
          entity.x += (pos.x - prevPos.x);
        }
        entity.y = rect.y - entity.h;
        entity.vy = 0;
        entity.onGround = true;
      }
    }
  }
  if(entity.y+entity.h > world.groundY+500){
    // fell off world - respawn
    if(entity===player){
      player.takeDamage(1, player.x);
      player.x = 60; player.y = world.groundY-30; player.vx=0; player.vy=0;
    }
  }
}

// ---------- Player update ----------
let gameTimeAccum = 0;
function updatePlayer(dt){
  if(player.dead){ return; }
  if(player.knockbackTimer>0){ player.knockbackTimer -= dt; }
  else {
    let moving = false;
    if(isLeft()){ player.vx = -MOVE_SPEED; player.facing=-1; moving=true; }
    else if(isRight()){ player.vx = MOVE_SPEED; player.facing=1; moving=true; }
    else { player.vx *= GROUND_FRICTION; if(Math.abs(player.vx)<5) player.vx=0; }

    if(isJumpPressed() && player.onGround && player._jumpReleased!==false){
      player.vy = JUMP_VELOCITY;
      player.onGround = false;
      SFX.jump();
      player._jumpHeld = true;
    }
  }
  player._jumpReleased = !isJumpPressed();

  // attack
  if(player.attackCooldown>0) player.attackCooldown -= dt;
  if(isAttackPressed() && player.attackCooldown<=0){
    player.attackCooldown = 0.35;
    player.attackActiveTimer = 0.15;
    player.state = 'attack';
    SFX.attack();
    const hitbox = {
      x: player.facing>0 ? player.x+player.w : player.x-26,
      y: player.y+4, w:26, h: player.h-8
    };
    enemies.forEach(en=>{
      if(!en.dead && rectsOverlap(hitbox, en.rect)){ en.takeHit(1); }
    });
    if(boss && !boss.dead && rectsOverlap(hitbox, boss.rect)){ boss.takeHit(1); }
  }
  if(player.attackActiveTimer>0) player.attackActiveTimer -= dt;

  // special
  if(isSpecialPressed() && player.specialReady){
    player.specialReady = false;
    player.loveCharge = 0;
    SFX.love();
    floatMsg('WEAPONIZED AFFECTION!');
    projectiles.push(new Projectile(
      player.facing>0? player.x+player.w: player.x-20, player.y+player.h/2-8,
      player.facing*420, 0, 18,18,'loveblast','player'
    ));
    updateHUD();
  }

  // gravity
  player.vy += GRAVITY*dt;
  player.vy = clamp(player.vy, -2000, 1400);
  player.x += player.vx*dt;
  player.x = clamp(player.x, 0, world.width-player.w);
  player.y += player.vy*dt;
  resolvePlatformCollisions(player, dt, gameTimeAccum);

  if(player.invuln>0) player.invuln -= dt;

  // animation state
  if(!player.onGround) player.state='jump';
  else if(player.attackActiveTimer>0) player.state='attack';
  else if(player.invuln>0.6) player.state='hurt';
  else if(Math.abs(player.vx)>10) player.state='walk';
  else player.state='idle';

  player.animTimer += dt;
  if(player.animTimer>0.15){ player.animTimer=0; player.walkFrame = 1-player.walkFrame; }

  // heart collection
  heartsList.forEach(h=>{
    if(!h.collected && rectsOverlap(player.rect, h.rect)){
      h.collected = true;
      player.addHeart();
      SFX.heart();
      spawnParticles(h.x+8,h.y+8,'#ff6f91',8,{size:3});
      floatMsg(choice(HEART_MSGS));
    }
  });

}
const HEART_MSGS = ['A little love for Bubs ❤️','HEART ACQUIRED!','Your boyfriend owes you one hug.','+1 reason your man is obsessed with you.','Very important loot.','BUBS POWER +1','Collect all the love, bubs!'];

// ---------- Enemies & world update ----------
function updateWorld(dt){
  gameTimeAccum += dt;
  enemies.forEach(en=>en.update(dt, world));
  // enemy-player collision damage
  enemies.forEach(en=>{
    if(!en.dead && player.invuln<=0 && rectsOverlap(player.rect, en.hurtRect)){
      player.takeDamage(1, en.x);
    }
  });
  // projectiles
  for(let i=projectiles.length-1;i>=0;i--){
    const pr = projectiles[i];
    pr.life -= dt;
    pr.x += pr.vx*dt; pr.y += pr.vy*dt;
    if(pr.life<=0){ projectiles.splice(i,1); continue; }
    if(pr.owner==='player'){
      enemies.forEach(en=>{ if(!en.dead && rectsOverlap(pr.rect, en.rect)){ en.takeHit(3); pr.dead=true; } });
      if(boss && !boss.dead && rectsOverlap(pr.rect, boss.rect)){ boss.takeHit(3); pr.dead=true; }
    } else if(pr.owner==='boss'){
      if(player.invuln<=0 && rectsOverlap(pr.rect, player.rect)){
        player.takeDamage(1, pr.x); pr.dead=true;
      }
    }
    if(pr.dead){ projectiles.splice(i,1); spawnParticles(pr.x,pr.y,'#ffb6c9',6,{size:2}); }
  }
  updateParticles(dt);

  // camera follow
  camera.x = clamp(player.x - VIEW_W/2, 0, Math.max(0,world.width-VIEW_W));

  // exit check
  if(!levelComplete && world.exit && rectsOverlap(player.rect, world.exit)){
    onLevelExit();
  }

  checkPlayerDeath();
}

let deathHandled = false;
function checkPlayerDeath(){
  if(player.dead && !deathHandled){
    deathHandled = true;
    document.getElementById('retryTitle').textContent = 'Bubs nooooo 😭 Even superheroes need a retry.';
    document.getElementById('retryBtn').textContent = 'TRY AGAIN, CUTIE';
    document.getElementById('retryPanel').classList.remove('hidden');
    paused = true;
  }
}

function onLevelExit(){
  levelComplete = true;
  SFX.portal();
  if(world.exit.mystery){
    floatMsg('Hmmm. What\'s that?');
    paused = true;
    setTimeout(()=>startFinalCinematic(), 900);
    return;
  }
  const msg = currentLevelIndex===0 ? 'LEVEL COMPLETE! BUBS IS TOO POWERFUL.' : 'YOU DID IT AGAIN. THAT\'S MY GIRL. ❤️';
  const panel = document.getElementById('cinematicPanel');
  const textEl = document.getElementById('cinematicText');
  panel.classList.remove('hidden');
  textEl.textContent = msg;
  paused = true;
  setTimeout(()=>{
    panel.classList.add('hidden');
    paused = false;
    if(currentLevelIndex < levels.length-1){
      loadLevel(currentLevelIndex+1);
    }
  }, 1800);
}

// ============================================================
// FINAL CINEMATIC -> BOSS UNLOCK
// ============================================================
let boss = null;
function startFinalCinematic(){
  const panel = document.getElementById('cinematicPanel');
  const textEl = document.getElementById('cinematicText');
  panel.classList.remove('hidden');
  const lines = [
    'YOU HAVE DEFEATED STRESS.',
    'YOU HAVE BONKED OVERTHINKING.',
    'YOU HAVE SURVIVED THE NONSENSE.',
    'BUT THERE IS ONE FINAL PROBLEM.',
  ];
  let i=0;
  function next(){
    if(i>=lines.length){
      panel.classList.add('hidden');
      document.getElementById('bossIntroPanel').classList.remove('hidden');
      return;
    }
    textEl.textContent = lines[i];
    i++;
    setTimeout(next, 1500);
  }
  next();
}
document.getElementById('bossStartBtn').addEventListener('click', ()=>{
  document.getElementById('bossIntroPanel').classList.add('hidden');
  startBossFight();
});

class Boss extends Entity{
  constructor(x,y){
    super(x,y,34,38);
    // Kept low on purpose: per the brief this fight should be short (~15-30s)
    // and easy to win with the default melee attack alone, with the Love
    // Blast special (granted at the start of this fight) as a fast-forward.
    this.maxHealth = 10; this.health = 10;
    this.facing=-1;
    this.dead=false;
    this.hitFlash=0;
    this.state='idle';
    this.attackTimer = rand(1.5,2.5);
    this.actionLock=0;
    this.vx=0;
    this.defeated=false;
  }
  takeHit(dmg){
    if(this.dead||this.defeated) return;
    this.health -= dmg;
    this.hitFlash=0.15;
    if(this.health<=0){
      this.health=0; this.defeated=true;
      SFX.victory();
      spawnParticles(this.x+this.w/2,this.y+this.h/2,'#ff6f91',20,{shape:'star',size:5});
      setTimeout(()=>onBossDefeated(), 600);
    }
  }
  update(dt){
    if(this.defeated){ this.state='defeat'; return; }
    if(this.hitFlash>0) this.hitFlash-=dt;
    this.facing = player.x < this.x ? -1:1;
    this.attackTimer -= dt;
    // gentle approach
    const dx = player.x - this.x;
    if(Math.abs(dx)>140){ this.x += Math.sign(dx)*40*dt; }
    this.x = clamp(this.x, bossArena.x+20, bossArena.x+bossArena.w-this.w-20);

    if(this.attackTimer<=0){
      this.attackTimer = rand(2.2,3.2);
      this.doAttack(choice(['joke','bubss']));
    }
  }
  doAttack(kind){
    this.state='attack';
    setTimeout(()=>{ if(!this.defeated) this.state='idle'; }, 400);
    if(kind==='joke'){
      floatMsg('BOOOOOO. 😭');
      projectiles.push(new Projectile(this.x+this.w/2, this.y+10, (this.facing)*160, -40, 16,16,'joke','boss'));
    } else if(kind==='bubss'){
      floatMsg('BUBSSSSSSS ❤️');
      for(let i=0;i<3;i++){
        projectiles.push(new Projectile(this.x+this.w/2, this.y+10+i*6, this.facing*120, -60+i*20, 14,14,'heart','boss'));
      }
    }
  }
}
let bossArena = {x:0,y:0,w:960,h:540};
let bossHealthEls = null;

function startBossFight(){
  inBossFight = true;
  SFX.bossAppear();
  world = {
    name:'BOYFRIEND BOSS ARENA', width: VIEW_W, groundY: 460,
    platforms:[{x:0,y:460,w:VIEW_W,h:80}], hearts:[], enemies:[], exit:null, bg:'boss'
  };
  bossArena = {x:0,y:0,w:VIEW_W,h:540};
  player = new Player(120, world.groundY-30);
  player.maxHealth=3; player.health=3;
  // The boss arena has no collectible hearts to charge Love Blast with, so
  // Bubs walks in already charged — otherwise the special is unreachable.
  player.loveCharge = 100;
  player.specialReady = true;
  enemies = [];
  heartsList = [];
  projectiles = [];
  boss = new Boss(VIEW_W-160, world.groundY-38);
  camera.x=0; camera.y=0;
  levelComplete=false; gameOverFlag=false; paused=false; deathHandled=false;
  setLevelLabel('BUBS ❤️❤️❤️  vs  YOUR MAN 💀');
  updateHUD();
}

function updateBossFight(dt){
  updatePlayer(dt);
  // No hearts to collect in the arena, so Love Blast slowly recharges on
  // its own during the fight instead of being a one-and-done.
  if(!player.specialReady && !player.dead){
    player.loveCharge = Math.min(100, player.loveCharge + dt*16);
    if(player.loveCharge>=100) player.specialReady = true;
    updateHUD();
  }
  boss.update(dt);
  // projectiles already handled generically but boss owner needs separate loop since no "enemies" list
  for(let i=projectiles.length-1;i>=0;i--){
    const pr = projectiles[i];
    pr.life -= dt;
    pr.x += pr.vx*dt; pr.y += pr.vy*dt;
    if(pr.life<=0){ projectiles.splice(i,1); continue; }
    if(pr.owner==='boss' && player.invuln<=0 && rectsOverlap(pr.rect, player.rect)){
      player.takeDamage(1, pr.x);
      projectiles.splice(i,1);
      spawnParticles(pr.x,pr.y,'#ffb6c9',6,{size:2});
    } else if(pr.owner==='player' && !boss.dead && !boss.defeated && rectsOverlap(pr.rect, boss.rect)){
      boss.takeHit(3);
      projectiles.splice(i,1);
    }
  }
  updateParticles(dt);
  // player attack vs boss already checked inside updatePlayer() via enemies+boss, fine.

  // body contact (harmless-ish)
  if(!boss.defeated && player.invuln<=0 && rectsOverlap(player.rect, boss.rect)){
    player.takeDamage(1, boss.x);
  }

  if(player.dead && !deathHandled){
    deathHandled = true;
    document.getElementById('retryTitle').textContent = "BUBS NOOOO 😭 HE'S BEING ANNOYING AGAIN.";
    document.getElementById('retryBtn').textContent = 'BONK HIM AGAIN.';
    document.getElementById('retryPanel').classList.remove('hidden');
    paused = true;
  }
}

function onBossDefeated(){
  paused = true;
  const panel = document.getElementById('endingPanel');
  const textEl = document.getElementById('endingText');
  panel.classList.remove('hidden');
  textEl.innerHTML = `
    <div style="font-size:24px; margin-bottom:10px;">BOYFRIEND DEFEATED.</div>
    <div>His health: 0.</div>
    <div>His love for Bubs: INFINITE.</div>
    <div style="margin-top:14px;">"OKAY OKAY YOU WIN 😭"</div>
    <div>"BUT I'M STILL YOUR BOYFRIEND."</div>
    <div>"AND I STILL LOVE YOU MORE THAN YOU LOVE WINNING THIS FIGHT."</div>
    <div style="margin-top:10px; font-style:italic;">...can I have a kiss now?</div>
  `;
  document.getElementById('kissBtn').classList.remove('hidden');
  document.getElementById('playAgainBtn').classList.add('hidden');
}
document.getElementById('kissBtn').addEventListener('click', ()=>{
  spawnParticles(VIEW_W/2, VIEW_H/2, '#ff6f91', 30, {shape:'star', size:6});
  SFX.victory();
  const textEl = document.getElementById('endingText');
  textEl.innerHTML = `
    <div style="font-size:20px;">ACHIEVEMENT UNLOCKED: WORLD'S CUTEST MENACE.</div>
    <div style="margin-top:10px;">You have defeated the world, bubs.</div>
    <div>Unfortunately, your boyfriend is still here.</div>
    <div>He loves you. This is a permanent debuff.</div>
    <div style="font-size:22px; margin-top:14px; color:#ffd9ec;">I LOVE YOU, BUBS. ❤️</div>
    <div style="font-style:italic; margin-top:6px;">Thank you for being my favourite person to annoy.</div>
  `;
  document.getElementById('kissBtn').classList.add('hidden');
  document.getElementById('playAgainBtn').classList.remove('hidden');
});
document.getElementById('playAgainBtn').addEventListener('click', ()=>{
  document.getElementById('endingPanel').classList.add('hidden');
  inBossFight=false; boss=null;
  resetGameFull();
});

// ============================================================
// PAUSE / RETRY wiring
// ============================================================
function togglePause(){
  if(gameOverFlag || levelComplete) return;
  if(!gameStarted) return;
  paused = !paused;
  document.getElementById('pausePanel').classList.toggle('hidden', !paused);
}
document.getElementById('pauseBtn').addEventListener('click', togglePause);
document.getElementById('resumeBtn').addEventListener('click', ()=>{ paused=false; document.getElementById('pausePanel').classList.add('hidden'); });
document.getElementById('restartBtn').addEventListener('click', ()=>{
  document.getElementById('pausePanel').classList.add('hidden');
  paused=false;
  if(inBossFight) startBossFight(); else loadLevel(currentLevelIndex);
});
document.getElementById('retryBtn').addEventListener('click', ()=>{
  document.getElementById('retryPanel').classList.add('hidden');
  paused=false;
  if(inBossFight) startBossFight(); else loadLevel(currentLevelIndex);
});

function resetGameFull(){
  secretHeartCollected=false;
  loadLevel(0);
}

// ============================================================
// RENDERING
// ============================================================
function drawBackground(theme){
  let top='#aee4ff', bottom='#ffd9b3';
  if(theme==='level2'){ top='#bcd9ff'; bottom='#ffe3c2'; }
  if(theme==='level3'){ top='#ffc2d9'; bottom='#ffb199'; }
  if(theme==='boss'){ top='#2b1e3a'; bottom='#ff7fb0'; }
  const g = ctx.createLinearGradient(0,0,0,VIEW_H);
  g.addColorStop(0,top); g.addColorStop(1,bottom);
  ctx.fillStyle=g;
  ctx.fillRect(0,0,VIEW_W,VIEW_H);
  // clouds (parallax)
  ctx.fillStyle = theme==='boss' ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.8)';
  for(let i=0;i<6;i++){
    const cx = ((i*340 - camera.x*0.3) % (VIEW_W+400)) - 200;
    const cy = 60 + (i%3)*40;
    drawCloudShape(cx,cy, 40+ (i%2)*10);
  }
  // hills
  ctx.fillStyle = theme==='boss' ? 'rgba(80,40,80,0.4)' : 'rgba(143,207,143,0.55)';
  for(let i=0;i<5;i++){
    const hx = ((i*500 - camera.x*0.6) % (VIEW_W+600)) - 300;
    ctx.beginPath();
    ctx.ellipse(hx+300, VIEW_H-20, 260, 90, 0, 0, Math.PI*2);
    ctx.fill();
  }
}
function drawCloudShape(x,y,s){
  ctx.beginPath();
  ctx.arc(x,y,s*0.5,0,Math.PI*2);
  ctx.arc(x+s*0.5,y-s*0.2,s*0.4,0,Math.PI*2);
  ctx.arc(x-s*0.5,y-s*0.1,s*0.35,0,Math.PI*2);
  ctx.fill();
}

function drawGroundAndPlatforms(){
  world.platforms.forEach(p=>{
    const pos = movingPlatformPos(p, gameTimeAccum);
    const sx = pos.x-camera.x, sy = pos.y-camera.y;
    if(sx+p.w<0 || sx>VIEW_W) return;
    const isGround = p.y >= world.groundY;
    ctx.fillStyle = isGround ? '#8fcf8f' : (p.moving?'#cdb4ff':'#ffd9b3');
    ctx.fillRect(sx, sy, p.w, 10);
    ctx.fillStyle = isGround ? '#6ba868' : (p.moving?'#a98ae0':'#e0ac78');
    ctx.fillRect(sx, sy+10, p.w, Math.min(p.h-10, 400));
    // little grass tufts on ground tops
    if(isGround){
      ctx.fillStyle='#6ba868';
      for(let gx=0; gx<p.w; gx+=24){
        ctx.fillRect(sx+gx, sy-4, 6, 6);
      }
    }
  });
}

function drawHeartsList(){
  heartsList.forEach(h=>{
    if(h.collected) return;
    h.bob += 0.06;
    const sy = h.y - camera.y + Math.sin(h.bob)*4;
    drawHeart(h.x+8-camera.x, sy+8, 16, '#ff5577');
  });
}

function drawEnemy(en){
  if(en.dead) return;
  const sx = en.x-camera.x, sy = en.y-camera.y;
  if(sx+40<0||sx>VIEW_W) return;
  ctx.save();
  if(en.hitFlash>0){ ctx.globalAlpha=0.5; }
  if(en.dir<0){ ctx.translate(sx+en.w, sy); ctx.scale(-1,1); } else { ctx.translate(sx,sy); }
  let spr = en.type==='stress'?cloudSprite:en.type==='overthinking'?ghostSprite:sleepySprite;
  ctx.drawImage(spr, 0,0, spr.width, spr.height, -4,-4, spr.width, spr.height);
  ctx.restore();
  ctx.globalAlpha=1;
  // health bar
  const barW=28;
  ctx.fillStyle='rgba(0,0,0,0.3)';
  ctx.fillRect(sx-2, sy-10, barW, 5);
  ctx.fillStyle='#ff6f91';
  ctx.fillRect(sx-2, sy-10, barW*(en.health/en.maxHealth), 5);
}

function drawProjectile(pr){
  const sx=pr.x-camera.x, sy=pr.y-camera.y;
  if(pr.kind==='loveblast'||pr.kind==='heart'){
    drawHeart(sx+8, sy+8, 18, pr.owner==='boss'?'#ffb6c9':'#ff2d78');
  } else {
    ctx.fillStyle='#fff';
    ctx.strokeStyle='#999';
    ctx.beginPath();
    ctx.ellipse(sx+8,sy+8,10,7,0,0,Math.PI*2);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle='#666';
    ctx.font='8px sans-serif';
    ctx.fillText('?!',sx+3,sy+11);
  }
}

function drawPlayer(){
  const sx = player.x-camera.x-4, sy = player.y-camera.y-2;
  let frameKey = 'idle';
  if(player.state==='walk') frameKey = player.walkFrame===0?'walk0':'walk1';
  else if(player.state==='jump') frameKey='jump';
  else if(player.state==='attack') frameKey='attack';
  else if(player.state==='hurt') frameKey='hurt';
  else if(player.victoryPose) frameKey='victory';
  const key = frameKey + (player.facing>0?'_r':'_l');
  const spr = bubsFrames[key];
  ctx.save();
  if(player.invuln>0 && Math.floor(player.invuln*20)%2===0){ ctx.globalAlpha=0.4; }
  ctx.drawImage(spr,0,0,32,32, sx,sy,32,32);
  ctx.restore();
  ctx.globalAlpha=1;
  // attack hitbox flash (visual feedback)
  if(player.attackActiveTimer>0){
    ctx.fillStyle='rgba(255,255,255,0.35)';
    const hx = player.facing>0? player.x+player.w-camera.x : player.x-26-camera.x;
    ctx.fillRect(hx, player.y+4-camera.y, 26, player.h-8);
  }
}

function drawBoss(){
  if(!boss) return;
  const sx = boss.x-camera.x-2, sy = boss.y-camera.y-4;
  let frameKey='idle';
  if(boss.state==='attack') frameKey='attack';
  if(boss.defeated) frameKey='defeat';
  const key = frameKey+(boss.facing>0?'_r':'_l');
  const spr = boyFrames[key];
  ctx.save();
  if(boss.hitFlash>0){ ctx.globalAlpha=0.5; }
  ctx.drawImage(spr,0,0,36,40,sx,sy,36,40);
  ctx.restore();
  ctx.globalAlpha=1;
  // boss health bar (big, top)
  if(!boss.defeated){
    const bw = 300;
    const bx = VIEW_W/2-bw/2, by=20;
    ctx.fillStyle='rgba(0,0,0,0.35)';
    ctx.fillRect(bx-3,by-3,bw+6,22);
    ctx.fillStyle='#4a3b36';
    ctx.fillRect(bx,by,bw,16);
    ctx.fillStyle='#ff6f91';
    ctx.fillRect(bx,by,bw*(boss.health/boss.maxHealth),16);
    ctx.fillStyle='#fff'; ctx.font='bold 12px sans-serif'; ctx.textAlign='center';
    ctx.fillText('YOUR MAN 💀', VIEW_W/2, by+13);
    ctx.textAlign='left';
  }
}

function drawExitPortal(){
  if(!world.exit) return;
  const sx = world.exit.x-camera.x, sy = world.exit.y-camera.y;
  const t = gameTimeAccum*3;
  ctx.save();
  ctx.translate(sx+world.exit.w/2, sy+world.exit.h/2);
  for(let i=0;i<3;i++){
    ctx.strokeStyle = world.exit.mystery ? `rgba(80,40,100,${0.5-i*0.1})` : `rgba(255,182,201,${0.6-i*0.15})`;
    ctx.lineWidth=4;
    ctx.beginPath();
    ctx.ellipse(0,0, 22+Math.sin(t+i)*4, world.exit.h/2, 0,0,Math.PI*2);
    ctx.stroke();
  }
  ctx.restore();
}

function drawSigns(){
  if(!world.signs) return;
  world.signs.forEach(s=>{
    const sx=s.x-camera.x, sy=s.y-camera.y;
    if(sx<-100||sx>VIEW_W+100) return;
    ctx.fillStyle='#b98a6a';
    ctx.fillRect(sx+10,sy+20,6,20);
    ctx.fillStyle='#fffaf2';
    ctx.fillRect(sx-10,sy,60,22);
    ctx.strokeStyle='#8a5a44'; ctx.strokeRect(sx-10,sy,60,22);
    ctx.fillStyle='#4a3b36'; ctx.font='8px sans-serif';
    wrapText(s.text, sx-8, sy+9, 56, 9);
  });
}
function wrapText(text,x,y,maxW,lh){
  const words = text.split(' ');
  let line='', yy=y;
  words.forEach(w=>{
    const test = line+w+' ';
    if(ctx.measureText(test).width>maxW && line){ ctx.fillText(line,x,yy); line=w+' '; yy+=lh; }
    else line=test;
  });
  ctx.fillText(line,x,yy);
}

// ============================================================
// MAIN LOOP
// ============================================================
// Fixed-timestep substeps: if the driving timer gets delayed (a throttled
// background tab, a janky device, a slow synchronous task), a single update
// using a tightly-clamped dt would make the whole game appear to run in
// slow motion instead of catching back up. Stepping the simulation forward
// in several small, stable chunks keeps physics correct either way.
const SUBSTEP = 1/60;
const MAX_SUBSTEPS = 8;
function gameFrame(ts){
  if(!lastTime) lastTime = ts;
  let frameDt = (ts-lastTime)/1000;
  lastTime = ts;
  frameDt = Math.min(frameDt, 0.5); // ignore genuinely huge pauses (e.g. tab away for minutes)

  ctx.clearRect(0,0,VIEW_W,VIEW_H);
  drawBackground(world.bg);

  if(!paused){
    let remaining = frameDt;
    let steps = 0;
    while(remaining > 0 && steps < MAX_SUBSTEPS){
      const dt = Math.min(SUBSTEP, remaining);
      if(inBossFight) updateBossFight(dt);
      else { updatePlayer(dt); updateWorld(dt); }
      remaining -= dt;
      steps++;
    }
  }

  drawGroundAndPlatforms();
  drawHeartsList();
  if(!inBossFight) enemies.forEach(drawEnemy);
  projectiles.forEach(drawProjectile);
  drawParticles(camera);
  drawPlayer();
  if(inBossFight) drawBoss();
  if(!inBossFight) drawExitPortal();
  if(!inBossFight) drawSigns();
}

function startGame(){
  if(gameStarted) return;
  gameStarted = true;
  loadLevel(0);
  lastTime = 0;
  // Driven by setInterval (rather than a self-recursive requestAnimationFrame)
  // so the loop keeps advancing reliably even in contexts that throttle rAF
  // for backgrounded/off-screen canvases, while still behaving like a normal
  // ~60fps game loop in any standard browser.
  setInterval(()=>{
    if(document.hidden) return;
    gameFrame(performance.now());
  }, 1000/60);
}



// safety: stop input bleed when window loses focus
window.addEventListener('blur', ()=>{
  Object.keys(keys).forEach(k=>keys[k]=false);
  Object.keys(touch).forEach(k=>touch[k]=false);
});

})();
