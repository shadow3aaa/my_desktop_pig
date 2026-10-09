import type { Pose } from './motion';

const fmt = (n: number) => Number(n.toFixed(4));
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const smooth = (a: number, b: number, x: number) => {
    const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
};
function around(x: number, y: number, angle = 0, sx = 1, sy = 1) {
    return `translate(${x} ${y}) rotate(${fmt(angle)}) scale(${fmt(sx)} ${fmt(sy)}) translate(${-x} ${-y})`;
}

/** Inner edge of the actual rounded leg, expressed in the torso's local space. */
function overlapEdge(hip: number[], knee: number[], foot: number[], radius: number, angle: number, torsoY: number, sx: number, sy: number) {
    const radians = angle * Math.PI / 180, cos = Math.cos(radians), sin = Math.sin(radians);
    const points: number[][] = [];
    for (let index = 0; index <= 32; index++) {
        const t = index / 32, u = 1 - t;
        const dx = 2 * (u * (knee[0] - hip[0]) + t * (foot[0] - knee[0]));
        const dy = 2 * (u * (knee[1] - hip[1]) + t * (foot[1] - knee[1]));
        const length = Math.hypot(dx, dy) || 1;
        // Offset the centreline by half its stroke width, along its surface normal.
        const x = u * u * hip[0] + 2 * u * t * knee[0] + t * t * foot[0] - radius * dy / length;
        const y = u * u * hip[1] + 2 * u * t * knee[1] + t * t * foot[1] + radius * dx / length;
        const worldX = hip[0] + (x - hip[0]) * cos - (y - hip[1]) * sin;
        const worldY = hip[1] + (x - hip[0]) * sin + (y - hip[1]) * cos;
        // Invert the torso transform so the edge stays on the leg during breathing.
        points.push([fmt(64 + (worldX - 64) / sx), fmt(110 + (worldY - torsoY - 110) / sy)]);
    }
    return points;
}

// The head silhouette and all facial features remain fixed. Only the back and
// underside settle into a low resting contour, as in the original sleep sprite.
const standingContour = [
    45.97, 24.86, 64.16, 17.46, 100.02, 15.78, 112.14, 35.14,
    124.39, 54.71, 115.94, 67.24, 114.53, 70.76,
    112.51, 75.81, 107.15, 88.1, 98.09, 90.74,
    91.03, 93.38, 83.97, 92.6, 76.38, 93.81,
    70.34, 94.77, 48.98, 108.13, 23.73, 97.05,
];
const restingContour = [
    45.97, 31, 64.16, 24, 100.02, 24, 112.14, 41,
    124.39, 57, 115.94, 71, 114.53, 74,
    112.51, 80, 107.15, 92, 98.09, 94,
    91.03, 99, 83.97, 98, 76.38, 98,
    70.34, 102, 48.98, 106, 23.73, 97.05,
];
const cheek = 'C-1.61 86.1 4.3 62.02 10.5 54.98s5.49-8.45 5.49-8.45-6.19 1.55-3.8-3.38 8.59-13.09 9.71-13.8c1.13-.7 4.79-1.83 6.76-.56s1.97 3.1 1.97 3.1';

// Each leg stays a single rounded limb behind the torso. The shoulder/hip moves
// with the body; the knee bends and the hoof slides underneath as the pig settles.
// Coordinates are in the SVG's ground space, so lowering the torso cannot drag
// the planted front hooves through the floor.
const legs = [
    { id: 'front-near', root: [54, 80], knee: [54, 99], foot: [54, 113.5], foldedKnee: [46, 113], tuckedFoot: [66, 113.5], sign: 1, delay: 0 },
    { id: 'front-far', root: [28, 80], knee: [28, 98], foot: [28, 111.5], foldedKnee: [26, 105], tuckedFoot: [48, 108], sign: -1, delay: .04 },
    { id: 'rear-near', root: [99, 73], knee: [100, 89], foot: [100, 100.5], foldedKnee: [96, 107], tuckedFoot: [113, 107.5], sign: -1, delay: .1 },
    { id: 'rear-far', root: [77, 78], knee: [77, 89], foot: [77, 99.5], foldedKnee: [87, 99], tuckedFoot: [82, 98], sign: 1, delay: .14 },
];

/** Single owner of SVG transforms. Sleep is a crouch of the existing character. */
export class SvgRenderer {
    svg: SVGSVGElement;
    parts: Record<string, SVGElement>;

    constructor(svg: SVGSVGElement) {
        this.svg = svg;
        this.parts = Object.fromEntries([...svg.querySelectorAll<SVGElement>('[id]')].map(el => [el.id, el]));
    }

    transform(id: string, value: string) { this.parts[id].setAttribute('transform', value); }
    opacity(id: string, value: number) { this.parts[id].setAttribute('opacity', String(fmt(value))); }

    render(p: Pose, facing = 1) {
        const sleep = Math.min(1, Math.max(0, p.sleep));
        const settle = smooth(.08, .96, sleep);
        const down = 14 * settle;

        this.transform('facing', facing === 1 ? 'translate(128 0) scale(-1 1)' : '');
        this.transform('body-motion', `translate(0 ${fmt(p.beat * -3 - p.drag * 2 + p.landingOffset)}) ${around(64, 108, p.sway, 1 + p.beat * .014, 1 - p.beat * .025)}`);
        this.parts.palette.style.filter = `hue-rotate(${fmt(p.colorAngle)}deg)`;

        // Keep head, ears, snout, tail and body proportions together. There is no
        // sleep-only replacement ear, face warp or second set of painted legs.
        const torsoY = fmt(down - Math.abs(p.gait) * 1.1);
        const sx = fmt(1 + p.breath * .003), sy = fmt(1 + p.breath * .006);
        this.transform('torso', `translate(0 ${torsoY}) ${around(64, 110, 0, sx, sy)}`);
        const contour = standingContour.map((value, i) => fmt(mix(value, restingContour[i], settle)));
        const neck = `C30.63 31.89 33.84 ${fmt(mix(29.78, 33, settle))} 45.94 ${fmt(mix(24.86, 31, settle))}Z`;
        this.parts['body-shape'].setAttribute('d', 'M' + contour.slice(0, 2).join(' ') + 'C' + contour.slice(2).join(' ') + cheek + neck);
        this.opacity('sleep-joints', smooth(.4, .94, sleep));

        for (const leg of legs) {
            const fold = smooth(leg.delay, .88 + leg.delay * .7, sleep);
            const hip = [leg.root[0], leg.root[1] + down];
            const knee = leg.knee.map((value, i) => mix(value, leg.foldedKnee[i], fold));
            const foot = leg.foot.map((value, i) => mix(value, leg.tuckedFoot[i], fold));
            this.parts['limb-' + leg.id].setAttribute('d', `M${hip.map(fmt).join(' ')}Q${knee.map(fmt).join(' ')} ${foot.map(fmt).join(' ')}`);
            const angle = fmt((p.gait * leg.sign * 19 + leg.sign * p.drag * 11) * (1 - fold));
            this.transform('leg-' + leg.id, around(hip[0], hip[1], angle));
            if (sleep > .4 && (leg.id === 'front-near' || leg.id === 'rear-near')) {
                const name = leg.id === 'front-near' ? 'front' : 'rear';
                const radius = Number(this.parts['limb-' + leg.id].getAttribute('stroke-width')) / 2;
                const edge = overlapEdge(hip, knee, foot, radius, angle, torsoY, sx, sy);
                this.parts['sleep-edge-' + name].setAttribute('d', 'M' + edge[0].join(' ') + 'L' + edge.slice(1).flat().join(' '));
                const tone = this.parts['sleep-edge-' + name + '-tone'];
                const end = edge[edge.length - 1];
                tone.setAttribute('x1', String(edge[0][0]));
                tone.setAttribute('y1', String(edge[0][1]));
                tone.setAttribute('x2', String(end[0]));
                tone.setAttribute('y2', String(end[1]));
            }
        }

        // The tail follows its attachment as the back settles. The ears retain
        // their original paths and local transforms in every pose.
        this.transform('tail', `translate(0 ${fmt(6 * settle)}) ${around(108, 28, p.tail * .8 + (p.reduced ? 0 : Math.sin(p.time * 7) * p.dance * 8))}`);
        this.transform('ear-near', around(62, 44, p.ear + p.beat * 8 - p.drag * 6));
        this.transform('ear-far', around(24, 35, -p.ear * .7 + p.beat * 4));
        this.transform('face', '');

        const eyeOpen = Math.max(.04, (1 - p.blink * .94) * (1 - sleep * .85));
        this.transform('eye-near', around(52.65, 66.23, 0, 1, eyeOpen));
        this.transform('eye-far', around(22.84, 60.19, 0, 1, eyeOpen));
        this.opacity('eye-near', 1 - sleep);
        this.opacity('eye-far', 1 - sleep);
        this.opacity('eyes-closed', sleep);
    }
}
