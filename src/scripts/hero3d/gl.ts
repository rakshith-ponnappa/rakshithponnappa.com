/**
 * Hand-written WebGL2 renderer for the hero topology: three instanced draws (lines, nodes, packets),
 * one shared uniform array, analytic anti-aliasing, no textures, no per-frame uploads.
 */
import type { Layout } from './topology';

/** Number of vec4s in the shared uniform array `U` (see index.ts for the layout). */
export const UN = 17;

const VH = `#version 300 es
precision highp float;
uniform vec4 U[${UN}];
layout(location=0) in vec2 q;
out vec2 vp;
vec3 P(vec4 a){
  if(a.w>.5)return vec3(U[1].xy+a.xy,1);
  vec2 c=cos(U[2].xy),s=sin(U[2].xy);
  float z=a.z*c.x-a.x*s.x,k=U[1].z/(U[1].z-a.y*s.y-z*c.y);
  return vec3(U[1].xy+vec2(a.x*c.x+a.z*s.x,a.y*c.y-z*s.y)*k,k);
}
vec4 O(vec2 p){vp=p;return vec4(p/U[0].xy*vec2(2,-2)+vec2(-1,1),0,1);}
float C(float i,vec4 c){return float(any(equal(vec4(i),c)));}
vec3 K(float i){return U[9+int(i)].rgb;}
`;

const FH = `#version 300 es
precision highp float;
uniform vec4 U[${UN}];
in vec2 vp;
out vec4 o;
float B(vec4 b,float r){vec2 q=abs(vp-b.xy)-b.zw+r;return length(max(q,0.))+min(max(q.x,q.y),0.)-r;}
float M(){
  return smoothstep(5.,9.,B(U[5],U[7].z))*smoothstep(5.,9.,B(U[6],U[7].w))
    *smoothstep(U[7].x,U[7].x+U[8].z,vp.x)*smoothstep(0.,16.,U[0].x-vp.x)
    *smoothstep(0.,10.,vp.y)*smoothstep(0.,36.,U[7].y-vp.y);
}
// c is premultiplied; coverage above 1 is normalised so rgb never exceeds alpha.
void W(vec3 c,float a){float m=M()/max(a,1.);o=vec4(c*m,a*m);}
float G(float x){return exp(-x*x);}
`;

// Lines: ring tracks (kind 0), traces (1) and port ticks (2), as screen-space quads.
const LINE = [
  `${VH}
layout(location=1) in vec4 A;layout(location=2) in vec4 Bv;layout(location=3) in vec4 S;layout(location=4) in vec4 T;layout(location=5) in vec4 V;
out float vd,vs,va;flat out float vw;flat out vec4 vS,vT;
void main(){
  vec3 a=P(A),b=P(Bv);
  vec2 d=b.xy-a.xy,t=d/max(length(d),1e-3),n=vec2(-t.y,t.x);
  float e=max(T.y,1./U[1].w);
  vw=e*.5;
  float w=vw+1.;
  vd=q.y*w;vs=mix(V.x,V.y,q.x);
  va=T.x*T.y/e*min(pow(mix(a.z,b.z,q.x),6.),1.);
  vS=S;vT=T;
  gl_Position=O(mix(a.xy,b.xy,q.x)+t*(q.x*2.-1.)+n*q.y*w);
}`,
  `${FH}
in float vd,vs,va;flat in float vw;flat in vec4 vS,vT;
float R(vec4 c){vec4 k=step(vS.y,c)*step(c,vec4(vS.z));return max(max(k.x,k.y),max(k.z,k.w));}
void main(){
  float a=clamp((vw-abs(vd))*U[1].w+.5,0.,1.)*va,p=floor(vT.z),on=fract(vT.z);
  if(p>0.)a*=smoothstep(on*.5+.8/p,on*.5-.8/p,abs(fract(vs/p-on*.5+.5)-.5));
  float h=R(U[3]),dp=R(U[4]);
  float th=U[0].z-U[2].z,sp=U[8].x+30.-mod(th*170.,U[8].x+110.);
  float td=U[0].z-U[2].w,pd=dp*G((vs-td*200.)/18.)*step(td,5.);
  float base=vS.x>1.5?.9:vS.x>.5?U[15].y:U[16].y;
  float al=a*(mix(base,.8,h)+h*G((vs-sp)/16.));
  W(mix(U[9+int(vS.w)].rgb,U[14].rgb,h)*al+U[12].rgb*a*pd,al+a*pd);
}`,
];

// Nodes: a crisp dot, a soft halo, a marker ring (roles, hover) and the deploy ripple.
const NODE = [
  `${VH}
layout(location=1) in vec4 N;layout(location=2) in vec4 E;
out vec2 vq;flat out vec4 vc,vx;
void main(){
  float t=U[0].z,i=E.x,hv=float(U[3].x==i),td=t-U[2].w-E.w/200.;
  vec3 p=P(vec4(N.xyz+vec3(0,0,sin(t*.31+E.y)*7.),0));
  float dp=float(U[4].x==i)*step(0.,td)*step(td,4.);
  float r=E.z*p.z*(1.+.5*hv+.06*sin(t*1.1+E.y*3.));
  vec3 c=mix(K(N.w),mix(U[12].rgb,U[9].rgb,smoothstep(.6,2.4,td)),dp*(1.-smoothstep(3.,4.,td)));
  vc=vec4(c,U[15].x*min(pow(p.z,5.),1.));
  vx=vec4(r,hv*.9+C(i,U[3])*.25+float(N.w<.5)*.4,td,dp);
  vec2 Q=vec2(q.x*2.-1.,q.y)*(max(r*9.,dp*60.)+2.);
  vq=Q;
  gl_Position=O(p.xy+Q);
}`,
  `${FH}
in vec2 vq;flat in vec4 vc,vx;
void main(){
  float d=length(vq),r=vx.x,s=U[1].w;
  float a=clamp((r-d)*s+.5,0.,1.)
    +exp(-d*d/(r*r*5.))*U[16].x
    +clamp(.8-abs(d-r-4.5)*s,0.,1.)*vx.y*.6
    +clamp(1.-abs(d-r-2.-vx.z*22.)*s,0.,1.)*vx.w*pow(max(0.,1.-vx.z/2.6),2.);
  W(vc.rgb*a*vc.a,a*vc.a);
}`,
];

// Packets: a bright head with a short comet tail. Each packet is instanced once per segment of its path and
// clipped to that segment's span, so it bends around corners; all motion is in the shader.
const PACKET = [
  `${VH}
layout(location=1) in vec4 A;layout(location=2) in vec4 Bv;layout(location=3) in vec4 S;layout(location=4) in vec4 Kp;
out vec2 vq;out float vs;flat out vec4 vc;flat out vec2 vr;
void main(){
  float u=fract(Kp.y+U[0].z*Kp.x/max(S.z-S.w,1.))*(1.+abs(Kp.z)),v=step(u,1.),dir=sign(Kp.z);
  u=min(u,1.);
  float sh=mix(S.z,S.w,Kp.z>0.?u:1.-u);
  vec3 a=P(A),b=P(Bv);
  vec2 d=b.xy-a.xy;
  float ds=S.y-S.x;
  vec2 m=-dir*sign(ds)*d/max(length(d),1e-3);
  vr=vec2(min(S.x,S.y),max(S.x,S.y));
  vq=vec2(mix(-16.,3.,q.x),q.y*3.);
  vs=sh-dir*vq.x;
  float in_=step(vr.x-3.,sh+16.)*step(sh-16.,vr.y+3.);
  vc=vec4(U[14].rgb,in_*v*sin(3.1416*u)*U[15].z*(1.+C(Kp.w,U[3]))*min(pow(mix(a.z,b.z,.5),6.),1.));
  gl_Position=in_>0.?O(a.xy+d*(sh-S.x)/(abs(ds)>1e-3?ds:1.)+m*vq.x+vec2(-m.y,m.x)*vq.y):vec4(2,2,2,1);
}`,
  `${FH}
in vec2 vq;in float vs;flat in vec4 vc;flat in vec2 vr;
void main(){
  float x=vq.x,y=vq.y,a=(exp(-(x*x+y*y)/1.8)+step(x,0.)*max(1.+x/16.,0.)*exp(-y*y/.6)*.5)*vc.a*step(vr.x,vs)*step(vs,vr.y);
  W(vc.rgb*a,a);
}`,
];

export interface Renderer {
  upload(L: Layout): void;
  draw(U: Float32Array, w: number, h: number, additive: boolean): void;
  dispose(): void;
}

export function createRenderer(gl: WebGL2RenderingContext): Renderer | null {
  const bufs: WebGLBuffer[] = [];
  const quad = gl.createBuffer()!;
  bufs.push(quad);
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, -1, 1, -1, 0, 1, 1, 1]), gl.STATIC_DRAW);

  const passes = [LINE, NODE, PACKET].map(([vs, fs], i) => {
    const p = gl.createProgram()!;
    for (const [type, src] of [
      [gl.VERTEX_SHADER, vs],
      [gl.FRAGMENT_SHADER, fs],
    ] as const) {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      gl.attachShader(p, s);
      gl.deleteShader(s);
    }
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      console.warn('[hero3d]', gl.getProgramInfoLog(p));
      return null;
    }
    const vao = gl.createVertexArray()!;
    const buf = gl.createBuffer()!;
    bufs.push(buf);
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    const vec4s = [5, 2, 4][i];
    for (let a = 1; a <= vec4s; a++) {
      gl.enableVertexAttribArray(a);
      gl.vertexAttribPointer(a, 4, gl.FLOAT, false, vec4s * 16, (a - 1) * 16);
      gl.vertexAttribDivisor(a, 1);
    }
    gl.bindVertexArray(null);
    return { p, vao, buf, u: gl.getUniformLocation(p, 'U'), n: 0 };
  });
  if (passes.some((p) => !p)) return null;
  const P = passes as NonNullable<(typeof passes)[number]>[];

  gl.disable(gl.DEPTH_TEST);
  gl.enable(gl.BLEND);
  gl.clearColor(0, 0, 0, 0);

  return {
    upload(L) {
      [
        [L.lines, L.nLines],
        [L.nodes, L.n],
        [L.packets, L.nPackets],
      ].forEach(([data, n], i) => {
        gl.bindBuffer(gl.ARRAY_BUFFER, P[i].buf);
        gl.bufferData(gl.ARRAY_BUFFER, data as Float32Array, gl.STATIC_DRAW);
        P[i].n = n as number;
      });
    },
    draw(U, w, h, additive) {
      gl.viewport(0, 0, w, h);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.blendFunc(gl.ONE, additive ? gl.ONE : gl.ONE_MINUS_SRC_ALPHA);
      for (const x of P) {
        gl.useProgram(x.p);
        gl.uniform4fv(x.u, U);
        gl.bindVertexArray(x.vao);
        gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, x.n);
      }
    },
    dispose() {
      for (const x of P) {
        gl.deleteProgram(x.p);
        gl.deleteVertexArray(x.vao);
      }
      bufs.forEach((b) => gl.deleteBuffer(b));
    },
  };
}
