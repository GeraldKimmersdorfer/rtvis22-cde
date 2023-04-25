// Minfied lzmajs.js:
var LZMAJS=LZMAJS||{};!function(e){"use strict";e.OutWindow=function(){this._windowSize=0},e.OutWindow.prototype.create=function(e){this._buffer&&this._windowSize===e||(this._buffer=new Uint8Array(e)),this._windowSize=e,this._pos=0,this._streamPos=0},e.OutWindow.prototype.flush=function(){var e=this._pos-this._streamPos;if(0!==e){if(this._stream.writeBytes)this._stream.writeBytes(this._buffer,e);else for(var t=0;t<e;t++)this._stream.writeByte(this._buffer[t]);this._pos>=this._windowSize&&(this._pos=0),this._streamPos=this._pos}},e.OutWindow.prototype.releaseStream=function(){this.flush(),this._stream=null},e.OutWindow.prototype.setStream=function(e){this.releaseStream(),this._stream=e},e.OutWindow.prototype.init=function(e){e||(this._streamPos=0,this._pos=0)},e.OutWindow.prototype.copyBlock=function(e,t){var i=this._pos-e-1;for(i<0&&(i+=this._windowSize);t--;)i>=this._windowSize&&(i=0),this._buffer[this._pos++]=this._buffer[i++],this._pos>=this._windowSize&&this.flush()},e.OutWindow.prototype.putByte=function(e){this._buffer[this._pos++]=e,this._pos>=this._windowSize&&this.flush()},e.OutWindow.prototype.getByte=function(e){var t=this._pos-e-1;return t<0&&(t+=this._windowSize),this._buffer[t]},e.RangeDecoder=function(){},e.RangeDecoder.prototype.setStream=function(e){this._stream=e},e.RangeDecoder.prototype.releaseStream=function(){this._stream=null},e.RangeDecoder.prototype.init=function(){var e=5;for(this._code=0,this._range=-1;e--;)this._code=this._code<<8|this._stream.readByte()},e.RangeDecoder.prototype.decodeDirectBits=function(e){for(var t,i=0,o=e;o--;)this._range>>>=1,t=this._code-this._range>>>31,this._code-=this._range&t-1,i=i<<1|1-t,(4278190080&this._range)==0&&(this._code=this._code<<8|this._stream.readByte(),this._range<<=8);return i},e.RangeDecoder.prototype.decodeBit=function(e,t){var i=e[t],o=(this._range>>>11)*i;return(2147483648^this._code)<(2147483648^o)?(this._range=o,e[t]+=2048-i>>>5,(4278190080&this._range)==0&&(this._code=this._code<<8|this._stream.readByte(),this._range<<=8),0):(this._range-=o,this._code-=o,e[t]-=i>>>5,(4278190080&this._range)==0&&(this._code=this._code<<8|this._stream.readByte(),this._range<<=8),1)},e.initBitModels=function(e,t){for(;t--;)e[t]=1024},e.BitTreeDecoder=function(e){this._models=[],this._numBitLevels=e},e.BitTreeDecoder.prototype.init=function(){e.initBitModels(this._models,1<<this._numBitLevels)},e.BitTreeDecoder.prototype.decode=function(e){for(var t=1,i=this._numBitLevels;i--;)t=t<<1|e.decodeBit(this._models,t);return t-(1<<this._numBitLevels)},e.BitTreeDecoder.prototype.reverseDecode=function(e){for(var t,i=1,o=0,r=0;r<this._numBitLevels;++r)t=e.decodeBit(this._models,i),i=i<<1|t,o|=t<<r;return o},e.reverseDecode2=function(e,t,i,o){for(var r,s=1,n=0,d=0;d<o;++d)r=i.decodeBit(e,t+s),s=s<<1|r,n|=r<<d;return n},e.LenDecoder=function(){this._choice=[],this._lowCoder=[],this._midCoder=[],this._highCoder=new e.BitTreeDecoder(8),this._numPosStates=0},e.LenDecoder.prototype.create=function(t){for(;this._numPosStates<t;++this._numPosStates)this._lowCoder[this._numPosStates]=new e.BitTreeDecoder(3),this._midCoder[this._numPosStates]=new e.BitTreeDecoder(3)},e.LenDecoder.prototype.init=function(){var t=this._numPosStates;for(e.initBitModels(this._choice,2);t--;)this._lowCoder[t].init(),this._midCoder[t].init();this._highCoder.init()},e.LenDecoder.prototype.decode=function(e,t){return 0===e.decodeBit(this._choice,0)?this._lowCoder[t].decode(e):0===e.decodeBit(this._choice,1)?8+this._midCoder[t].decode(e):16+this._highCoder.decode(e)},e.Decoder2=function(){this._decoders=[]},e.Decoder2.prototype.init=function(){e.initBitModels(this._decoders,768)},e.Decoder2.prototype.decodeNormal=function(e){var t=1;do t=t<<1|e.decodeBit(this._decoders,t);while(t<256);return 255&t},e.Decoder2.prototype.decodeWithMatchByte=function(e,t){var i,o,r=1;do if(i=t>>7&1,t<<=1,o=e.decodeBit(this._decoders,(1+i<<8)+r),r=r<<1|o,i!==o){for(;r<256;)r=r<<1|e.decodeBit(this._decoders,r);break}while(r<256);return 255&r},e.LiteralDecoder=function(){},e.LiteralDecoder.prototype.create=function(t,i){var o;if(!this._coders||this._numPrevBits!==i||this._numPosBits!==t)for(this._numPosBits=t,this._posMask=(1<<t)-1,this._numPrevBits=i,this._coders=[],o=1<<this._numPrevBits+this._numPosBits;o--;)this._coders[o]=new e.Decoder2},e.LiteralDecoder.prototype.init=function(){for(var e=1<<this._numPrevBits+this._numPosBits;e--;)this._coders[e].init()},e.LiteralDecoder.prototype.getDecoder=function(e,t){return this._coders[((e&this._posMask)<<this._numPrevBits)+((255&t)>>>8-this._numPrevBits)]},e.Decoder=function(){this._outWindow=new e.OutWindow,this._rangeDecoder=new e.RangeDecoder,this._isMatchDecoders=[],this._isRepDecoders=[],this._isRepG0Decoders=[],this._isRepG1Decoders=[],this._isRepG2Decoders=[],this._isRep0LongDecoders=[],this._posSlotDecoder=[],this._posDecoders=[],this._posAlignDecoder=new e.BitTreeDecoder(4),this._lenDecoder=new e.LenDecoder,this._repLenDecoder=new e.LenDecoder,this._literalDecoder=new e.LiteralDecoder,this._dictionarySize=-1,this._dictionarySizeCheck=-1,this._posSlotDecoder[0]=new e.BitTreeDecoder(6),this._posSlotDecoder[1]=new e.BitTreeDecoder(6),this._posSlotDecoder[2]=new e.BitTreeDecoder(6),this._posSlotDecoder[3]=new e.BitTreeDecoder(6)},e.Decoder.prototype.setDictionarySize=function(e){return!(e<0)&&(this._dictionarySize!==e&&(this._dictionarySize=e,this._dictionarySizeCheck=Math.max(this._dictionarySize,1),this._outWindow.create(Math.max(this._dictionarySizeCheck,4096))),!0)},e.Decoder.prototype.setLcLpPb=function(e,t,i){var o=1<<i;return!(e>8)&&!(t>4)&&!(i>4)&&(this._literalDecoder.create(t,e),this._lenDecoder.create(o),this._repLenDecoder.create(o),this._posStateMask=o-1,!0)},e.Decoder.prototype.setProperties=function(e){if(!this.setLcLpPb(e.lc,e.lp,e.pb))throw Error("Incorrect stream properties");if(!this.setDictionarySize(e.dictionarySize))throw Error("Invalid dictionary size")},e.Decoder.prototype.decodeHeader=function(e){var t,i,o,r,s,n;return!(e.size<13)&&(i=(t=e.readByte())%9,o=(t=~~(t/9))%5,r=~~(t/5),n=e.readByte(),n|=e.readByte()<<8,n|=e.readByte()<<16,n+=16777216*e.readByte(),s=e.readByte(),s|=e.readByte()<<8,s|=e.readByte()<<16,s+=16777216*e.readByte(),e.readByte(),e.readByte(),e.readByte(),e.readByte(),{lc:i,lp:o,pb:r,dictionarySize:n,uncompressedSize:s})},e.Decoder.prototype.init=function(){var t=4;for(this._outWindow.init(!1),e.initBitModels(this._isMatchDecoders,192),e.initBitModels(this._isRep0LongDecoders,192),e.initBitModels(this._isRepDecoders,12),e.initBitModels(this._isRepG0Decoders,12),e.initBitModels(this._isRepG1Decoders,12),e.initBitModels(this._isRepG2Decoders,12),e.initBitModels(this._posDecoders,114),this._literalDecoder.init();t--;)this._posSlotDecoder[t].init();this._lenDecoder.init(),this._repLenDecoder.init(),this._posAlignDecoder.init(),this._rangeDecoder.init()},e.Decoder.prototype.decodeBody=function(t,i,o){var r,s,n,d,c,h,a=0,f=0,u=0,p=0,$=0,D=0,l=0;for(this._rangeDecoder.setStream(t),this._outWindow.setStream(i),this.init();o<0||D<o;)if(r=D&this._posStateMask,0===this._rangeDecoder.decodeBit(this._isMatchDecoders,(a<<4)+r))s=this._literalDecoder.getDecoder(D++,l),l=a>=7?s.decodeWithMatchByte(this._rangeDecoder,this._outWindow.getByte(f)):s.decodeNormal(this._rangeDecoder),this._outWindow.putByte(l),a=a<4?0:a-(a<10?3:6);else{if(1===this._rangeDecoder.decodeBit(this._isRepDecoders,a))n=0,0===this._rangeDecoder.decodeBit(this._isRepG0Decoders,a)?0===this._rangeDecoder.decodeBit(this._isRep0LongDecoders,(a<<4)+r)&&(a=a<7?9:11,n=1):(0===this._rangeDecoder.decodeBit(this._isRepG1Decoders,a)?d=u:(0===this._rangeDecoder.decodeBit(this._isRepG2Decoders,a)?d=p:(d=$,$=p),p=u),u=f,f=d),0===n&&(n=2+this._repLenDecoder.decode(this._rangeDecoder,r),a=a<7?8:11);else if($=p,p=u,u=f,n=2+this._lenDecoder.decode(this._rangeDecoder,r),a=a<7?7:10,(c=this._posSlotDecoder[n<=5?n-2:3].decode(this._rangeDecoder))>=4){if(h=(c>>1)-1,f=(2|1&c)<<h,c<14)f+=e.reverseDecode2(this._posDecoders,f-c-1,this._rangeDecoder,h);else if(f+=this._rangeDecoder.decodeDirectBits(h-4)<<4,(f+=this._posAlignDecoder.reverseDecode(this._rangeDecoder))<0){if(-1===f)break;return!1}}else f=c;if(f>=D||f>=this._dictionarySizeCheck)return!1;this._outWindow.copyBlock(f,n),D+=n,l=this._outWindow.getByte(0)}return this._outWindow.flush(),this._outWindow.releaseStream(),this._rangeDecoder.releaseStream(),!0},e.Decoder.prototype.setDecoderProperties=function(e){var t,i,o,r,s;return!(e.size<5)&&(i=(t=e.readByte())%9,o=(t=~~(t/9))%5,r=~~(t/5),!!this.setLcLpPb(i,o,r)&&(s=e.readByte(),s|=e.readByte()<<8,s|=e.readByte()<<16,s+=16777216*e.readByte(),this.setDictionarySize(s)))},e.decompress=function(t,i,o,r){var s=new e.Decoder;if(!s.setDecoderProperties(t))throw Error("Incorrect LZMAJS stream properties");if(!s.decodeBody(i,o,r))throw Error("Error in LZMAJS data stream");return o},e.decompressFile=function(t,i){t instanceof ArrayBuffer&&(t=new e.iStream(t)),!i&&e.oStream&&(i=new e.oStream);var o=new e.Decoder,r=o.decodeHeader(t),s=r.uncompressedSize;if(o.setProperties(r),!o.decodeBody(t,i,s))throw Error("Error in LZMAJS data stream");return i},e.decode=e.decompressFile,e.iStream=function(e){this.array=new Uint8Array(e),this.size=e.byteLength,this.offset=0},e.iStream.prototype.readByte=function(){return this.array[this.offset++]},e.oStream=function(t){this.size=0,this.buffers=[],t=t||[];for(var i=0,o=t.length;i<o;i++)if(t[i]instanceof e.oStream)for(var r=t[i].buffers,s=0;s<r.length;s++)this.buffers.push(t[i].buffers[s]),this.size+=t[i].buffers[s].length;else this.buffers.push(t[i]),this.size+=t[i].length},e.oStream.prototype.writeBytes=function e(t,i){if(i<=t.byteLength)this.buffers.push(t.slice(0,i));else throw Error("Buffer too small?");this.size+=i},e.oStream.prototype.toUint8Array=function e(){var t=this.size,i=this.buffers;if(1==i.length)return i[0];try{for(var o=new Uint8Array(t),r=0,s=0;r<i.length;r++)o.set(i[r],s),s+=i[r].length;return i[0]=o,i.length=1,o}catch(n){console.error("Error allocating Uint8Array of size: ",t),console.error("Message given was: ",n.toString())}return null},e.oStream.prototype.forEach=function e(t){for(var i=0;i<this.buffers.length;i++)t.call(this,this.buffers[i])},e.oStream.prototype.toCodePoints=function t(){return e.UTF8||this.toUint8Array(),e.UTF8.decode(this.toUint8Array())},e.oStream.prototype.toString=function t(){var i=this.buffers,o="";e.UTF8&&(i=[this.toCodePoints()]);for(var r=0,s=i.length;r<s;r++)for(var n=0,d=i[r].length;n<d;n++)o+=String.fromCharCode(i[r][n]);return o}}(LZMAJS);

self.onmessage = function(msg){ // Using onmessage to receive the message in the worker.js 
    let buffer = msg.data;
    let outStream = new LZMAJS.oStream();
    try {
        LZMAJS.decode(buffer, outStream);
    } catch (error) {
        self.postMessage(error);
    }
    self.postMessage(outStream.toUint8Array());
} 