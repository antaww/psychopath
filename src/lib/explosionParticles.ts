export interface Particle {
	x: number;
	y: number;
	size: number;
	color: string;
	vx: number;
	vy: number;
	alpha: number;
	life: number;
	initialLife: number;
}

export const EXPLOSION_DURATION = 300; // ms
const NUM_PARTICLES = 50;
const PARTICLE_SIZE = 5;
const PARTICLE_SPEED_MULTIPLIER = 4;

export let particles: Particle[] = [];
let lastParticleAnimationTime: number = 0;

export function createParticles(centerX: number, centerY: number, particleColor: string) {
	particles = [];
	for (let i = 0; i < NUM_PARTICLES; i++) {
		const angle = Math.random() * 2 * Math.PI;
		const speed = Math.random() * PARTICLE_SPEED_MULTIPLIER + 0.5; // Random speed between 0.5 and 4.5
		particles.push({
			x: centerX,
			y: centerY,
			size: PARTICLE_SIZE,
			color: particleColor,
			vx: Math.cos(angle) * speed,
			vy: Math.sin(angle) * speed,
			alpha: 1,
			life: EXPLOSION_DURATION,
			initialLife: EXPLOSION_DURATION,
		});
	}
	lastParticleAnimationTime = performance.now();
}

export function updateAndDrawParticles(ctx: CanvasRenderingContext2D): boolean {
	const currentTime = performance.now();
	const deltaTime = currentTime - lastParticleAnimationTime;
	lastParticleAnimationTime = currentTime;

	for (let i = particles.length - 1; i >= 0; i--) {
		const p = particles[i];

		p.x += p.vx * (deltaTime / 16.66); // Adjust velocity based on time (assuming 60fps base)
		p.y += p.vy * (deltaTime / 16.66);

		p.life -= deltaTime;
		p.alpha = Math.max(0, p.life / p.initialLife);

		ctx.save();
		ctx.globalAlpha = p.alpha;
		ctx.fillStyle = p.color;
		ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
		ctx.restore();

		if (p.life <= 0) {
			particles.splice(i, 1);
		}
	}

	return particles.length > 0;
} 