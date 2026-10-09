import type { Pose } from './motion';
/** Single owner of SVG geometry. Limbs are rounded joint curves, never cut-off rectangles. */
const fmt = (n: number) => Number(n.toFixed(4));
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const smooth = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
function around(x: number, y: number, angle = 0, sx = 1, sy = 1) { return `translate(${x} ${y}) rotate(${fmt(angle)}) scale(${fmt(sx)} ${fmt(sy)}) translate(${-x} ${-y})`; }
// Upper contour stays identical. Only the abdomen/haunch control points morph.
const upper = 'M45.97 24.86c18.19-7.4 54.05-9.08 66.17 10.28 12.25 19.57 3.8 32.1 2.39 35.62';
const standingLower = [112.51, 75.81, 107.15, 88.1, 98.09, 90.74, 91.03, 93.38, 83.97, 92.6, 76.38, 93.81, 70.34, 94.77, 48.98, 108.13, 23.73, 97.05];
const restingLower = [117, 83, 114, 98, 104, 104, 94, 110, 84, 112, 73, 112, 57, 112, 37, 109, 23, 99];
const cheek = 'C-1.61 86.1 4.3 62.02 10.5 54.98s5.49-8.45 5.49-8.45-6.19 1.55-3.8-3.38 8.59-13.09 9.71-13.8c1.13-.7 4.79-1.83 6.76-.56s1.97 3.1 1.97 3.1 3.21-2.11 15.31-7.03z';
const legSpecs = [
    { id: 'front-near', root: [54, 80], knee: [54, 99], foot: [54, 113.5], restRoot: [54, 88], restKnee: [44, 105], restFoot: [64, 103], sign: 1, delay: 0 },
    { id: 'front-far', root: [28, 80], knee: [28, 98], foot: [28, 111.5], restRoot: [29, 86], restKnee: [33, 101], restFoot: [39, 100], sign: -1, delay: .05 },
    { id: 'rear-near', root: [99, 73], knee: [100, 89], foot: [100, 100.5], restRoot: [99, 80], restKnee: [110, 101], restFoot: [88, 102], sign: -1, delay: .16 },
    { id: 'rear-far', root: [77, 78], knee: [77, 89], foot: [77, 99.5], restRoot: [79, 82], restKnee: [86, 102], restFoot: [80, 100], sign: 1, delay: .21 },
];
export class SvgRenderer {
    svg: SVGSVGElement;
    parts: Record<string, SVGElement>;
    constructor(svg: SVGSVGElement) { this.svg = svg; this.parts = Object.fromEntries([...svg.querySelectorAll<SVGElement>('[id]')].map(el => [el.id, el])); }
    transform(id: string, v: string) { this.parts[id].setAttribute('transform', v); }
    opacity(id: string, v: number) { this.parts[id].setAttribute('opacity', String(fmt(v))); }
    render(p: Pose, facing = 1) {
        const s = Math.min(1, Math.max(0, p.sleep)), awake = 1 - s, settle = smooth(0, .72, s), belly = smooth(0, .72, s), down = 8 * settle;
        this.transform('facing', facing === 1 ? 'translate(128 0) scale(-1 1)' : '');
        this.transform('body-motion', `translate(0 ${fmt(p.beat * -3 - p.drag * 2 + p.landingOffset)}) ${around(64, 108, p.sway, 1 + p.beat * .014, 1 - p.beat * .025)}`);
        this.parts.palette.style.filter = `hue-rotate(${fmt(p.colorAngle)}deg)`;
        // Preserve the head and upper-body proportions; a small rigid settle is enough.
        const torsoTransform = `translate(0 ${fmt(down - Math.abs(p.gait) * 1.1)}) ${around(64, 110, 0, 1 + p.breath * .003, 1 + p.breath * .006)}`;
        this.transform('torso', torsoTransform);
        this.transform('flank-clip-body', torsoTransform);
        this.opacity('flank-limbs', smooth(.15, .66, s));
        const values = standingLower.map((v, i) => fmt(mix(v, restingLower[i], belly)));
        this.parts['body-shape'].setAttribute('d', upper + 'C' + values.slice(0, 6).join(' ') + 'C' + values.slice(6, 12).join(' ') + 'C' + values.slice(12, 18).join(' ') + cheek);
        // Near legs fold onto the visible flank: the foreleg points back, the hock forward.
        // Far legs retract behind the solid torso and become geometrically occluded.
        // Paws remain planted until the abdomen carries the weight, then lift onto the flank.
        // No alpha hiding or vertical leg squash; standing/walking curves stay unchanged.
        for (const leg of legSpecs) {
            const fold = smooth(leg.delay, .79 + leg.delay * .7, s);
            const hip = [mix(leg.root[0], leg.restRoot[0], fold), mix(leg.root[1], leg.restRoot[1], fold) + down];
            const knee = leg.knee.map((v, i) => mix(v, leg.restKnee[i], fold));
            const lift = smooth(.58, .95, s);
            const foot = leg.foot.map((v, i) => mix(v, leg.restFoot[i], i === 1 ? lift : fold));
            this.parts['limb-' + leg.id].setAttribute('d', `M${hip.map(fmt).join(' ')}Q${knee.map(fmt).join(' ')} ${foot.map(fmt).join(' ')}`);
            this.transform('leg-' + leg.id, around(hip[0], hip[1], (p.gait * leg.sign * 19 + leg.sign * p.drag * 11) * (1 - fold)));
            if (leg.id.endsWith('near')) {
                // Preserve the original standing occlusion; reveal the same limb on the flank as it folds.
                const shade = smooth(.18, .72, s), side = this.parts['side-limb-' + leg.id];
                side.setAttribute('d', `M${hip.map(fmt).join(' ')}Q${knee.map(fmt).join(' ')} ${foot.map(fmt).join(' ')}`);
                side.setAttribute('stroke', `rgb(255,${Math.round(210 - 8 * shade)},${Math.round(177 - 7 * shade)})`);
                this.transform('side-leg-' + leg.id, around(hip[0], hip[1], (p.gait * leg.sign * 19 + leg.sign * p.drag * 11) * (1 - fold)));
            }
        }
        const frontFold = smooth(0, .79, s), rearFold = smooth(.16, .902, s);
        const trace = (a: number[], b: number[], t: number) => a.map((v, i) => fmt(mix(v, b[i], t)));
        const fore = trace([50, 95, 49, 99, 49, 107, 52, 111, 54, 114, 59, 115, 61, 110], [50, 101, 46, 104, 46, 109, 52, 110, 58, 111, 64, 108, 67, 105], frontFold);
        const hind = trace([101, 84, 106, 89, 107, 98, 102, 101, 97, 104, 93, 103, 89, 99], [101, 88, 109, 92, 110, 101, 103, 105, 97, 109, 90, 107, 85, 103], rearFold);
        const curve = (v: number[]) => 'M' + v.slice(0, 2).join(' ') + 'C' + v.slice(2, 8).join(' ') + 'C' + v.slice(8, 14).join(' ');
        this.parts['fold-front'].setAttribute('d', curve(fore));
        this.parts['fold-rear'].setAttribute('d', curve(hind));
        this.opacity('fold-lines', smooth(.2, .7, s));
        this.transform('fold-lines', `translate(0 ${fmt(p.breath * .25)})`);
        this.transform('tail', around(108, 28, p.tail * .8 + (p.reduced ? 0 : Math.sin(p.time * 7) * p.dance * 8)));
        this.transform('ear-near', around(62, 44, p.ear + p.beat * 8 - p.drag * 6 + s * 3));
        this.transform('ear-far', around(24, 35, -p.ear * .7 + p.beat * 4));
        this.transform('face', `translate(0 ${fmt(s * .8)})`);
        const eyeOpen = Math.max(.04, (1 - p.blink * .94) * (1 - s * .85));
        this.transform('eye-near', around(52.65, 66.23, 0, 1, eyeOpen));
        this.transform('eye-far', around(22.84, 60.19, 0, 1, eyeOpen));
        this.opacity('eye-near', awake);
        this.opacity('eye-far', awake);
        this.opacity('eyes-closed', s);
    }
}
