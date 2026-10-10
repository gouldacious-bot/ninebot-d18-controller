/* JavaScript adaptation of scooterhacking/NinebotCrypto (majsi/nopbxlr).
 * SPDX-License-Identifier: AGPL-3.0-only. See LICENSE and PROTOCOL_NOTES.md.
 */
class NinebotCrypto {
  constructor() {
    this.fixed = Uint8Array.from([0x97,0xcf,0xb8,0x02,0x84,0x41,0x43,0xde,0x56,0,0x2b,0x3b,0x34,0x78,0x0a,0x5d]);
    this.challenge = new Uint8Array(16); this.appKey = null; this.counter = 0;
  }
  async initialize(name) {
    this.name = new Uint8Array(16);
    this.name.set(new TextEncoder().encode(name).slice(0,16));
    await this.derive(this.name, this.fixed);
  }
  async derive(a,b) {
    const input = new Uint8Array(32); input.set(a); input.set(b,16);
    const key = new Uint8Array(await crypto.subtle.digest('SHA-1',input)).slice(0,16);
    this.key = await crypto.subtle.importKey('raw',key,{name:'AES-CBC'},false,['encrypt']);
  }
  async block(input) {
    // CBC's first block with a zero IV equals ECB(block), independent of padding.
    return new Uint8Array(await crypto.subtle.encrypt({name:'AES-CBC',iv:new Uint8Array(16)},this.key,input)).slice(0,16);
  }
  nonce(counter,flag,last=0) {
    const b=new Uint8Array(16); b[0]=flag;
    new DataView(b.buffer).setUint32(1,counter,false); b.set(this.challenge.slice(0,8),5); b[15]=last; return b;
  }
  async transform(input,counter) {
    const output=new Uint8Array(input.length);
    let blockIndex=0;
    for(let i=0;i<input.length;i+=16) {
      const stream=await this.block(counter===0?this.fixed:this.nonce(counter,1,++blockIndex));
      for(let j=0;j<Math.min(16,input.length-i);j++) output[i+j]=input[i+j]^stream[j];
    }
    return output;
  }
  checksum(payload) { return (~payload.reduce((sum,b)=>sum+b,0))&0xffff; }
  async mac(plain,counter) {
    let state=await this.block(this.nonce(counter,0x59,plain.length-3));
    const header=new Uint8Array(16);header.set(plain.slice(0,3));
    for(let j=0;j<16;j++)header[j]^=state[j];state=await this.block(header);
    for(let i=3;i<plain.length;i+=16) {
      const chunk=new Uint8Array(16);chunk.set(plain.slice(i,i+16));
      for(let j=0;j<16;j++)chunk[j]^=state[j];state=await this.block(chunk);
    }
    const stream=await this.block(this.nonce(counter,1));
    return Uint8Array.from(state.slice(0,4),(b,i)=>b^stream[i]);
  }
  async encrypt(plain) {
    const counter=this.counter===0?0:this.counter+1;
    if(counter>0xffff)throw new Error('Session counter exhausted; reconnect.');
    const output=new Uint8Array(plain.length+6);output.set(plain.slice(0,3));
    output.set(await this.transform(plain.slice(3),counter),3);
    if(counter===0) {
      const sum=this.checksum(plain.slice(3));output[plain.length+2]=sum&255;output[plain.length+3]=sum>>8;
    } else {
      output.set(await this.mac(plain,counter),plain.length);
      output[plain.length+4]=counter>>8;output[plain.length+5]=counter&255;
    }
    this.counter=counter===0?1:counter;
    if(plain[5]===0x5c&&plain[6]===0&&plain[2]===16)this.appKey=plain.slice(7);
    return output;
  }
  async decrypt(wire) {
    if(wire.length<13||wire[0]!==0x5a||wire[1]!==0xa5||wire.length!==wire[2]+13)throw new Error('Invalid encrypted frame length.');
    const counter=(wire[wire.length-2]<<8)|wire[wire.length-1];
    const plain=new Uint8Array(wire.length-6);plain.set(wire.slice(0,3));
    plain.set(await this.transform(wire.slice(3,-6),counter),3);
    if(counter===0) {
      const sum=this.checksum(plain.slice(3));
      if(wire[wire.length-4]!== (sum&255)||wire[wire.length-3]!==sum>>8)throw new Error('Handshake checksum failed.');
    } else {
      if(counter<=this.counter)throw new Error('Stale response counter.');
      const mac=await this.mac(plain,counter);
      if(mac.some((b,i)=>b!==wire[plain.length+i]))throw new Error('Response authentication failed.');
    }
    if(plain[3]===0x21&&plain[4]===0x3e&&plain[5]===0x5b&&plain[2]===30) {
      this.challenge=plain.slice(7,23);await this.derive(this.name,this.challenge);
    }
    if(counter>0) this.counter=counter;
    if(plain[3]===0x21&&plain[4]===0x3e&&plain[5]===0x5c&&plain[6]===1&&this.appKey)await this.derive(this.appKey,this.challenge);
    return plain;
  }
}
window.NinebotCrypto=NinebotCrypto;
