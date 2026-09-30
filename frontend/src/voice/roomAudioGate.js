// In a busy room, only send microphone audio during the expert's turn.
// A short release delay avoids reopening between audio packets or on speaker echo.
export class RoomAudioGate {
  constructor({setMuted,onReady,delay=250}) { this.setMuted=setMuted;this.onReady=onReady;this.delay=delay;this.timer=null;this.enabled=true;this.speaking=true;this.closed=false; }
  update({enabled=this.enabled,speaking=this.speaking}={}) {
    if(this.closed)return;
    this.enabled=enabled;this.speaking=speaking;clearTimeout(this.timer);
    if(!enabled){this.setMuted(false);this.onReady(!speaking);return;}
    this.setMuted(true);this.onReady(false);
    if(!speaking)this.timer=setTimeout(()=>{if(!this.closed&&!this.speaking){this.setMuted(false);this.onReady(true);}},this.delay);
  }
  close(){this.closed=true;clearTimeout(this.timer);}
}
