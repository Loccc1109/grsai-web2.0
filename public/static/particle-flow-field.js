(() => {
    'use strict';

    const canvas = document.createElement('canvas');
    canvas.className = 'particle-field';
    canvas.setAttribute('aria-hidden', 'true');
    canvas.setAttribute('role', 'presentation');
    document.body.prepend(canvas);

    const ctx = canvas.getContext('2d', { alpha: true, desynchronized: true });
    if (!ctx) return;

    const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
    const state = { width: 0, height: 0, dpr: 1, raf: 0, last: 0, time: 0, paused: false };
    let particles = [];

    function resize() {
        state.width = Math.max(1, innerWidth);
        state.height = Math.max(1, innerHeight);
        state.dpr = Math.min(devicePixelRatio || 1, 1.5);
        canvas.width = Math.floor(state.width * state.dpr);
        canvas.height = Math.floor(state.height * state.dpr);
        canvas.style.width = `${state.width}px`;
        canvas.style.height = `${state.height}px`;
        ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
        createParticles();
    }

    function createParticles() {
        const count = Math.min(420, Math.max(150, Math.round((state.width * state.height) / 5200)));
        const centerX = state.width * 0.5;
        const centerY = state.height * 0.48;
        const spread = Math.min(state.width, state.height) * 0.68;

        particles = Array.from({ length: count }, (_, index) => {
            const arm = index % 3;
            const radius = Math.random() * spread;
            const angle = arm * Math.PI * 2 / 3 + radius * 0.008 + (Math.random() - 0.5) * 1.8;
            return {
                x: centerX + Math.cos(angle) * radius,
                y: centerY + Math.sin(angle) * radius * 0.48,
                size: Math.random() * 1.25 + 0.35,
                alpha: Math.random() * 0.4 + 0.12,
                phase: Math.random() * Math.PI * 2,
                speed: Math.random() * 0.3 + 0.7
            };
        });
    }

    function fieldAngle(x, y, time) {
        const nx = x / Math.max(state.width, 1) - 0.5;
        const ny = y / Math.max(state.height, 1) - 0.5;
        const swirl = Math.atan2(ny * 0.9, nx) + Math.PI * 0.5;
        const wave = Math.sin(nx * 7 + time * 0.24) * 0.42
            + Math.cos(ny * 9 - time * 0.18) * 0.28;
        return swirl + wave + Math.sin((nx + ny) * 12 + time * 0.12) * 0.18;
    }

    function draw(timestamp) {
        state.raf = 0;
        if (state.paused) return;

        const elapsed = Math.min(48, timestamp - (state.last || timestamp));
        state.last = timestamp;
        state.time += elapsed * 0.001;
        ctx.clearRect(0, 0, state.width, state.height);

        const animate = !reducedMotion.matches;
        const centerX = state.width * 0.5;
        const centerY = state.height * 0.48;
        const maxDistance = Math.min(state.width, state.height) * 0.72;

        ctx.lineWidth = 0.55;
        particles.forEach((particle) => {
            const oldX = particle.x;
            const oldY = particle.y;

            if (animate) {
                const angle = fieldAngle(particle.x, particle.y, state.time) * particle.speed;
                particle.x += Math.cos(angle) * elapsed * 0.014;
                particle.y += Math.sin(angle) * elapsed * 0.014;
                particle.x += (centerX - particle.x) * elapsed * 0.000004;
                particle.y += (centerY - particle.y) * elapsed * 0.0000015;
            }

            const distance = Math.hypot(particle.x - centerX, particle.y - centerY);
            if (distance > maxDistance || particle.x < -24 || particle.x > state.width + 24 || particle.y < -24 || particle.y > state.height + 24) {
                particle.x = centerX + (Math.random() - 0.5) * state.width * 0.95;
                particle.y = centerY + (Math.random() - 0.5) * state.height * 0.58;
            }

            const depth = 1 - Math.min(distance / maxDistance, 1);
            const alpha = particle.alpha * (0.38 + depth * 0.72);
            ctx.strokeStyle = `rgba(174, 187, 218, ${alpha * 0.38})`;
            ctx.beginPath();
            ctx.moveTo(oldX, oldY);
            ctx.lineTo(particle.x, particle.y);
            ctx.stroke();

            ctx.fillStyle = `rgba(220, 226, 241, ${alpha})`;
            ctx.beginPath();
            ctx.arc(particle.x, particle.y, particle.size * (0.72 + depth * 0.45), 0, Math.PI * 2);
            ctx.fill();
        });

        if (animate) state.raf = requestAnimationFrame(draw);
    }

    function start() {
        if (reducedMotion.matches) draw(performance.now());
        else if (!state.raf) state.raf = requestAnimationFrame(draw);
    }

    resize();
    addEventListener('resize', resize, { passive: true });
    document.addEventListener('visibilitychange', () => {
        state.paused = document.hidden;
        if (!state.paused) {
            state.last = performance.now();
            start();
        }
    }, { passive: true });
    reducedMotion.addEventListener?.('change', () => { resize(); start(); });
    start();
})();
