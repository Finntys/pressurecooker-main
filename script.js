/* ==========================
   scripts.js
   - Controls the 4-frame flow described by the user
   - Comments mark FRAME 1..4 implementation sections
   ==========================

   Usage notes:
   - Adjust `recordHoleOffsetX`/`Y` in the configuration section to tell the
     vinyl where the centre hole should land on the record player.
   - The code computes pixel‑perfect centering on load and on resize.
*/

/* --------------------------
   Configurable variables (user-editable)
   - recordHoleOffsetX/Y: where the centre of the vinyl should land
     relative to the record player image (0 … 1 in each dimension).
     (0.5,0.5 is the geometric center.)
   - NEEDLE_X_RATIO/NEEDLE_Y_RATIO and NEEDLE_VERTICAL_OFFSET: control where
     the needle overlay sits on the player.  You can tweak these values by
     holding Shift or Alt and dragging the needle in the running app; the
     console will print the updated ratios so you can paste them back here.
   -------------------------- */
// Example: put the hole a quarter from the left and centered vertically
let recordHoleOffsetX = 0.39;
let recordHoleOffsetY = 0.50;

// When the needle rotation reaches this angle (deg) while over the vinyl,
// spinning/audio begin. The value is exposed so you can tweak if needed.
const NEEDLE_PLAY_ANGLE = 20;

/* State and element references */
const body = document.body;
const vinyl = document.getElementById('vinyl');
const instruction = document.getElementById('instruction');
const trackList = document.getElementById('trackList');
const loadingText = document.getElementById('loadingText');
const recordPlayer = document.getElementById('recordPlayer');
const needle = document.getElementById('needle');
const pitchKnob = document.getElementById('pitchKnob');
const returnBtn = document.getElementById('returnBtn');
const audioPlayer = document.getElementById('audioPlayer');

/* utility for pitch changes */
function changePitch(rate) {
  audioPlayer.playbackRate = rate;
}

// current pitch thresholds will be calculated from knob position


let state = 1; // current frame (1..4)
let vinylSize = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--vinyl-size')) || 560;
let vinylEnlarged = false;

/* Helper: place the vinyl at exact coordinates (left, top) in px
   and optionally set rotation in degrees. All transitions handled by CSS. */
function placeVinyl(left, top, rotation = 0, width = vinylSize, height = vinylSize, scale = 1){
    // Use transform scale so the visual size animates smoothly without changing layout width/height
  vinyl.style.width = width + 'px';
  vinyl.style.height = height + 'px';
  vinyl.style.left = Math.round(left) + 'px';
  vinyl.style.top = Math.round(top) + 'px';
  vinyl.style.transform = `rotate(${rotation}deg) scale(${scale})`;
}

/* Compute centered coords for given size */
function centeredCoords(width, height){
  const left = (window.innerWidth - width) / 2;
  const top = (window.innerHeight - height) / 2;
  return {left, top};
}
/* Helpers to position auxiliary images */
// constants used by helper functions -- adjust these if the graphics change
// position of the needle relative to the record player image.  You can
// tweak these three values directly below when you want the start position
// changed.  No CSS variables or extra machinery necessary.
let NEEDLE_X_RATIO = 0.78; // horizontal position (0=left edge of player, 1=right)
let NEEDLE_Y_RATIO = 0.15; // vertical position (0=top edge, 1=bottom)
let NEEDLE_VERTICAL_OFFSET = -200; // lift needle up in px once placed
const NEEDLE_DRAG_HEIGHT_RATIO = 0.1; // fraction of needle height (from bottom) that is draggable

function positionNeedle(){
  if(!recordPlayer || !needle) return;
  const rect = recordPlayer.getBoundingClientRect();
  // allow CSS overrides via custom properties so the start location can be
  // controlled purely in style.css without editing the JS file.
  const styles = getComputedStyle(document.documentElement);
  const cssX = parseFloat(styles.getPropertyValue('--needle-x-ratio'));
  const cssY = parseFloat(styles.getPropertyValue('--needle-y-ratio'));
  const cssOff = parseFloat(styles.getPropertyValue('--needle-vertical-offset'));
  const xRatio = isNaN(cssX) ? NEEDLE_X_RATIO : cssX;
  const yRatio = isNaN(cssY) ? NEEDLE_Y_RATIO : cssY;
  const offset = isNaN(cssOff) ? NEEDLE_VERTICAL_OFFSET : cssOff;
  needle.style.left = rect.left + rect.width * xRatio + 'px';
  needle.style.top  = rect.top  + rect.height * yRatio + offset + 'px';
}

function positionPitchKnob(){
  if(!recordPlayer || !pitchKnob) return;
  const rect = recordPlayer.getBoundingClientRect();
  /*
    knob offset: the horizontal ratio determines how far from the left edge
    of the record player the knob will sit. if the knob appears too far left
    or right, adjust this value between 0 and 1.
  */
  const KNOB_X_RATIO = 0.915; // tweak me (higher -> move right)  
  const KNOB_Y_RATIO = 0.667;  // vertical placement ratio

  const x = rect.left + rect.width * KNOB_X_RATIO;
  pitchKnob.style.left = x + 'px';
  pitchKnob.baseX = x; // remember for vertical-only dragging
  pitchKnob.style.top  = rect.top  + rect.height * KNOB_Y_RATIO + 'px';
  // record vertical bounds for drag restraint
  pitchKnob.dataset.minY = rect.top + rect.height * 0.525;
  pitchKnob.dataset.maxY = rect.top + rect.height * 0.825;
}

function repositionForFrame4(){
  if(state !== 4) return;
  const rect = recordPlayer.getBoundingClientRect();
  // allow vinyl hole position overrides via CSS variables
  const styles = getComputedStyle(document.documentElement);
  const cssX = parseFloat(styles.getPropertyValue('--vinyl-hole-x-ratio'));
  const cssY = parseFloat(styles.getPropertyValue('--vinyl-hole-y-ratio'));
  const xRatio = isNaN(cssX) ? recordHoleOffsetX : cssX;
  const yRatio = isNaN(cssY) ? recordHoleOffsetY : cssY;
  const targetCenterX = rect.left + rect.width * xRatio;
  const targetCenterY = rect.top  + rect.height * yRatio;
  const vW = vinyl.offsetWidth;
  const vH = vinyl.offsetHeight;
  const targetLeft = targetCenterX - (vW / 2);
  const targetTop  = targetCenterY - (vH / 2);
  const finalScale = 1.2; // always land around 1.2x of original
  vinylEnlarged = false;
  placeVinyl(targetLeft, targetTop, 0, vW, vH, finalScale);
  positionNeedle();
  positionPitchKnob();
  // set initial pitch based on knob location
  const minY = parseFloat(pitchKnob.dataset.minY);
  const maxY = parseFloat(pitchKnob.dataset.maxY);
  const y = parseFloat(pitchKnob.style.top);
  updatePitchFromKnob(y, minY, maxY);
  resetNeedle();
}
/* Initialize positions (FRAME 1) */
function initFrame1(){
  state = 1;
  body.style.backgroundColor = '#7C4949';
  vinylSize = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--vinyl-size')) || 560;
  const {left, top} = centeredCoords(vinylSize, vinylSize);
  placeVinyl(left, top, 0, vinylSize, vinylSize);
    // Instruction below the vinyl
  instruction.style.top = (top + vinylSize + 14) + 'px';
  instruction.style.opacity = '1';

    // Hide other frame elements
  trackList.classList.remove('active'); trackList.setAttribute('aria-hidden','true');
  loadingText.classList.remove('show'); loadingText.setAttribute('aria-hidden','true');
  recordPlayer.classList.remove('show'); recordPlayer.setAttribute('aria-hidden','true');
  recordPlayer.style.left = '';
   // clear any inline positioning so the CSS base (`left:-120%`) applies
  vinyl.classList.remove('spinning');
  returnBtn.classList.remove('show'); returnBtn.setAttribute('aria-hidden','true');

  audioPlayer.pause();
  audioPlayer.currentTime = 0;
}


/* FRAME 2: vinyl moves left (30% offscreen) and track list slides out */
function startFrame2(){
  if(state !==1) return;
  state = 2;
    // Fade background to #683636
  body.style.backgroundColor = '#683636';
  instruction.style.opacity = '0';

    // Compute current center left/top based on current vinyl size
  const w = vinyl.offsetWidth;
  const h = vinyl.offsetHeight;
  const curLeft = parseFloat(vinyl.style.left || 0);
  const curTop = parseFloat(vinyl.style.top || 0);
    // Scale the vinyl up smoothly to double size
  const scale = 2;
  vinylEnlarged = true;

  // Target: place vinyl so that 30% of the image is offscreen to the left
  // Use scaled width when computing how much is offscreen so the visual result is correct
  const offPx = 0.3 * w * scale;
  const targetLeft = -offPx;
    // Keep vertical centered
  const targetTop = curTop;

  
  // Rotate by 145deg while moving, with ease-in/out via CSS transition
  placeVinyl(targetLeft, targetTop, 145, w, h, scale);

    // Show track list with slide-out effect
  // Position the track list origin to the vinyl's original center (FRAME 1 position)
  const vinylCenterX = curLeft + (w/2);
  const vinylCenterY = curTop + (h/2);
  trackList.style.left = vinylCenterX + 'px';
  trackList.style.top = vinylCenterY + 'px';
  trackList.style.transform = 'translate(-50%,-50%)';

  setTimeout(()=>{
    trackList.classList.add('active');
    trackList.setAttribute('aria-hidden','false');
  }, 300);
}

/* FRAME 3: when a track is selected -> show loading while keeping the vinyl in its
   enlarged off–screen position. No spinning happens yet; the record will start
   rotating only once it has actually landed on the player in FRAME 4. */
function startFrame3(trackIndex){
  if(state !== 2) return;
  state = 3;
    // fade background into #688D49
  body.style.backgroundColor = '#688D49';

    // Fade out the track list immediately when a track is chosen
  trackList.classList.remove('active');
  trackList.setAttribute('aria-hidden','true');

    // show loading text shortly after
  setTimeout(() => {
    loadingText.classList.add('show');
    loadingText.setAttribute('aria-hidden','false');
  }, 120);
  // After ~500ms move to frame 4
  setTimeout(() => startFrame4(trackIndex), 500);
}


/* FRAME 4: final presentation with recordPlayer sliding in and vinyl landing on it
   before starting to spin. The vinyl shrinks back to its normal size and rotates to
   0°; spinning only begins once the movement animation has finished. */
function startFrame4(trackIndex){
  state = 4;
  body.style.backgroundColor = '#1B1B1A';
  loadingText.classList.remove('show');
  loadingText.setAttribute('aria-hidden','true');

  // reveal auxiliary overlays (needle and pitch knob) early
  if(needle) needle.classList.add('show');
  if(pitchKnob) pitchKnob.classList.add('show');

    // animate record player in (CSS now handles sliding from -120% to 50%)
  recordPlayer.setAttribute('aria-hidden','false');
    // clear any leftover inline left so the base -120% is used
  recordPlayer.style.left = '';
  recordPlayer.classList.add('show');

  // when the record player has completed its transition, move the vinyl
  const onPlayerShown = (e) => {
    // wait for the height transition (guarantees the player has reached its
    // final size/position). opacity also works as a fallback.
    if (e.propertyName !== 'height' && e.propertyName !== 'opacity') return;
    recordPlayer.removeEventListener('transitionend', onPlayerShown);

    // fly the helper to do the positioning (updates vinyl, needle, knob)
    const finalScale = 1.2; // keep in sync with repositionForFrame4
    repositionForFrame4();
  
    // record has arrived; scale variable stored so needle can start spin later
    const onVinylMoved = (evt) => {
      if (evt.propertyName === 'left') {
        vinyl.removeEventListener('transitionend', onVinylMoved);
        // ensure the spin animation respects the final scale once started
        vinyl.style.setProperty('--spin-scale', finalScale);
        // actual spinning and audio playback are deferred until the needle tip hits
      }
    };
    vinyl.addEventListener('transitionend', onVinylMoved);
  };

  
    recordPlayer.addEventListener('transitionend', onPlayerShown);
    
    // Show return button slightly after everything else
  setTimeout(()=>{
    returnBtn.classList.add('show');
    returnBtn.setAttribute('aria-hidden','false');
  }, 900);
}

/* Reset everything back to Frame 1 */
function goBackToFrame1(){
   // remove classes and re-init
  trackList.classList.remove('active'); trackList.setAttribute('aria-hidden','true');
  loadingText.classList.remove('show'); loadingText.setAttribute('aria-hidden','true');
  recordPlayer.classList.remove('show'); recordPlayer.setAttribute('aria-hidden','true');
  vinyl.classList.remove('spinning');
  returnBtn.classList.remove('show'); returnBtn.setAttribute('aria-hidden','true');
  if(needle) needle.classList.remove('show');
  if(pitchKnob) pitchKnob.classList.remove('show');

  audioPlayer.pause();
  audioPlayer.currentTime = 0;

  // small delay to visually reset
  setTimeout(()=>{ initFrame1(); }, 300);
}

/* Event wiring */
vinyl.addEventListener('click', ()=>{ if(state === 1) startFrame2(); });
// Track selection handlers (FRAME 2 -> FRAME 3)
trackList.addEventListener('click', (e)=>{
  const li = e.target.closest('li');
  if(!li) return;
  const idx = li.getAttribute('data-track');
   // point audio element at the chosen file (assumes naming pattern Sound#.mp3)
  audioPlayer.src = `audio/Sound${idx}.mp3`;
   // begin loading for selected track
  startFrame3(idx);
});

// Return button
returnBtn.addEventListener('click', ()=>{ 
  goBackToFrame1(); 
});

/* simple drag logic for the pitch knob (vertical only) */
if(pitchKnob){
  let dragging = false;
  pitchKnob.addEventListener('pointerdown', e=>{
     dragging=true;
     pitchKnob.setPointerCapture(e.pointerId);
     e.preventDefault();
  });
  pitchKnob.addEventListener('pointermove', e=>{
     if(!dragging) return;
     // x remains fixed at baseX
     let y = e.clientY - pitchKnob.offsetHeight/2;
     const minY = parseFloat(pitchKnob.dataset.minY);
     const maxY = parseFloat(pitchKnob.dataset.maxY);
     if(!isNaN(minY) && !isNaN(maxY)){
        y = Math.min(Math.max(y, minY), maxY);
     }
     if(!isNaN(pitchKnob.baseX)){
        pitchKnob.style.left = pitchKnob.baseX + 'px';
     }
     pitchKnob.style.top  = y + 'px';
     // update audio pitch based on vertical position
     updatePitchFromKnob(y, minY, maxY);
  });
  ['pointerup','pointercancel'].forEach(evt=>{
     pitchKnob.addEventListener(evt, e=>{
        dragging=false;
        pitchKnob.releasePointerCapture(e.pointerId);
     });
  });

  // pitch control helper --------------------------------------------------
  function updatePitchFromKnob(y, minY, maxY){
     if(isNaN(minY) || isNaN(maxY)) return;
     const pct = (y - minY) / (maxY - minY); // 0 = top, 1 = bottom
     let rate;
     if(pct <= 0.5){
        // top half: 78->33.3
        rate = 2.228 + (1.0 - 2.228) * (pct / 0.5);
     } else {
        // bottom half: 33.3->45
        rate = 1.0 + (1.363 - 1.0) * ((pct - 0.5) / 0.5);
     }
     changePitch(rate);
  }
}

/* needle helpers and drag implementation */
let needleDragging = false;
let needleHome = {tipX:0, tipY:0};
let needleOnRecord = false;
let needleStartY = 0;
let needleStartAngle = 0;
// when true, pointer moves reposition the needle instead of rotating it
let manualAdjust = false;

// ease-in spinner state
let spinAnimating = false;
function startSpinWithEase(){
  if(spinAnimating) return;
  spinAnimating = true;
  // clear any existing CSS animation so we can manually rotate
  vinyl.classList.remove('spinning');
  let angle = 0;
  let speed = 0;
  const scale = parseFloat(getComputedStyle(vinyl).getPropertyValue('--spin-scale')) || 1;
  function step(){
     speed += 0.5; // acceleration per frame
     angle += speed;
     vinyl.style.transform = `rotate(${angle}deg) scale(${scale})`;
     if(speed < 20){
        requestAnimationFrame(step);
     } else {
        // hand control back to CSS animation
        vinyl.style.transform = '';
        vinyl.classList.add('spinning');
        spinAnimating = false;
     }
  }
  requestAnimationFrame(step);
}

function stopSpin(){
  vinyl.classList.remove('spinning');
  vinyl.style.transform = '';
}


function updateNeedleHome(){
  if(!needle) return;
  const rect = needle.getBoundingClientRect();
  // use the bottom NEEDLE_DRAG_HEIGHT_RATIO portion of the needle image as the draggable "tip" zone
  needleHome.tipX = rect.left + rect.width/2;
  needleHome.tipY = rect.top + rect.height * (1 - NEEDLE_DRAG_HEIGHT_RATIO);
}

function resetNeedle(){
  if(!needle) return;
  updateNeedleHome();
  needle.style.transform = 'rotate(0deg)';
  needleOnRecord = false;
}

needle.addEventListener('pointerdown', e=>{
   // hold Shift or Alt while clicking/dragging to *reposition* the needle anchor
   // instead of rotating it. the updated ratios will be logged to the console
   // so you can copy them back into the constants at the top of the file.
   if (e.shiftKey || e.altKey) {
     manualAdjust = true;
     needle.setPointerCapture(e.pointerId);
     e.preventDefault();
     return;
   }
   // update home every time because rotation/translation may have moved the element
   updateNeedleHome();
   const rect = needle.getBoundingClientRect();
   const clickY = e.clientY - rect.top;
   // only begin dragging when the user starts in the bottom draggable portion
   if(clickY < rect.height * (1 - NEEDLE_DRAG_HEIGHT_RATIO)) return;
   needleDragging = true;
   needleStartY = e.clientY;
   // extract current rotation angle from transform if present
   const m = window.getComputedStyle(needle).transform.match(/matrix\([^,]+,[^,]+,[^,]+,[^,]+,[^,]+,[^,]+\)/);
   if(m){
      // approximate angle extraction
      const values = m[0].slice(7,-1).split(',');
      const a = parseFloat(values[0]);
      needleStartAngle = Math.atan2(parseFloat(values[1]), a) * (180/Math.PI);
   } else {
      needleStartAngle = 0;
   }
   needle.setPointerCapture(e.pointerId);
   e.preventDefault();
});
needle.addEventListener('pointermove', e=>{
   if(manualAdjust){
     // allow free repositioning of the needle anchor when shift/alt is held
     const rect = recordPlayer.getBoundingClientRect();
     const nrect = needle.getBoundingClientRect();
     const newLeft = e.clientX - nrect.width/2;
     const newTop  = e.clientY - nrect.height/2;
     needle.style.left = newLeft + 'px';
     needle.style.top  = newTop  + 'px';
     // convert back to ratios so future calls reposition correctly
     NEEDLE_X_RATIO = (newLeft - rect.left) / rect.width;
     // account for vertical offset when computing ratio
     NEEDLE_Y_RATIO = (newTop - rect.top - NEEDLE_VERTICAL_OFFSET) / rect.height;
     console.log('needle ratios updated',
                 'x=', NEEDLE_X_RATIO.toFixed(3),
                 'y=', NEEDLE_Y_RATIO.toFixed(3),
                 'vertOff=', NEEDLE_VERTICAL_OFFSET);
     return;
   }
   if(!needleDragging) return;
   // calculate change in y from drag start for relative rotation
   const dy = e.clientY - needleStartY;
   // reversed sign: dragging down now rotates counter‑clockwise
   let angle = needleStartAngle - dy/5;
   angle = Math.min(Math.max(angle, 0), 25); // clamp to 0..25
   // horizontal movement purely cosmetic, limited by maxDx
   const dx = e.clientX - needleHome.tipX;
   const maxDx = 0; // set small value if you want horizontal wiggle
   const clampedDx = Math.max(Math.min(dx, maxDx), -maxDx);
   needle.style.transform = `rotate(${angle}deg) translateX(${clampedDx}px)`;

   const vinylRect = vinyl.getBoundingClientRect();
   const over = e.clientX >= vinylRect.left && e.clientX <= vinylRect.right &&
                e.clientY >= vinylRect.top && e.clientY <= vinylRect.bottom;
   const meetsAngle = angle >= NEEDLE_PLAY_ANGLE;
   const isOnNow = over && meetsAngle;
   if(isOnNow && !needleOnRecord){
     needleOnRecord = true;
     startSpinWithEase();
     audioPlayer.play().catch(err=>console.warn('audio play failed',err));
   } else if(!isOnNow && needleOnRecord){
     needleOnRecord = false;
     stopSpin();
     new Audio('audio/NeedleDropSoundEffect.mp3').play();
     audioPlayer.pause();
   }
});
['pointerup','pointercancel'].forEach(evt=>{
   needle.addEventListener(evt, e=>{
      if(manualAdjust){
         manualAdjust = false;
         needle.releasePointerCapture(e.pointerId);
         return;
      }
      needleDragging=false;
      needle.releasePointerCapture(e.pointerId);
   });
});

/* Recompute positions on resize so centering remains exact */
window.addEventListener('resize', ()=>{ 
  if(state === 1) initFrame1(); 
  if(state === 4) repositionForFrame4();
});

/* Boot: wait for images to load then initialize */
window.addEventListener('load', ()=>{
  // Ensure we read the CSS variable again in case media queries changed it
   vinylSize = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--vinyl-size')) || 560; 
   initFrame1(); });