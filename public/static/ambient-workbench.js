(() => {
    const root = document.documentElement;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const pointer = { x: innerWidth * 0.72, y: innerHeight * 0.28, tx: innerWidth * 0.72, ty: innerHeight * 0.28 };
    let raf = 0;
    let active = false;

    function setPointer(x, y) {
        pointer.tx = x;
        pointer.ty = y;
        active = true;
    }

    function render() {
        raf = 0;
        const ease = reducedMotion.matches ? 1 : 0.075;
        pointer.x += (pointer.tx - pointer.x) * ease;
        pointer.y += (pointer.ty - pointer.y) * ease;
        root.style.setProperty('--pointer-x', `${pointer.x}px`);
        root.style.setProperty('--pointer-y', `${pointer.y}px`);
        root.style.setProperty('--pointer-x-ratio', `${pointer.x / Math.max(innerWidth, 1)}`);
        root.style.setProperty('--pointer-y-ratio', `${pointer.y / Math.max(innerHeight, 1)}`);
        if (active && (Math.abs(pointer.tx - pointer.x) > 0.15 || Math.abs(pointer.ty - pointer.y) > 0.15)) {
            raf = requestAnimationFrame(render);
        }
    }

    function schedule() {
        if (!raf) raf = requestAnimationFrame(render);
    }

    function ripple(event) {
        if (reducedMotion.matches) return;
        const button = event.target.closest('button, .upload-area, .gallery-action-btn');
        if (!button || button.disabled) return;
        const rect = button.getBoundingClientRect();
        const dot = document.createElement('i');
        dot.className = 'ui-ripple';
        dot.style.left = `${event.clientX - rect.left}px`;
        dot.style.top = `${event.clientY - rect.top}px`;
        button.appendChild(dot);
        dot.addEventListener('animationend', () => dot.remove(), { once: true });
    }

    function updateStatus() {
        const status = document.querySelector('[data-workbench-status]');
        if (!status) return;
        const count = document.querySelectorAll('#desktop > .window:not(.minimized)').length;
        status.querySelector('[data-window-count]').textContent = `${count} ${count === 1 ? 'window' : 'windows'}`;
    }

    function installStatus() {
        const header = document.querySelector('.header');
        if (!header || header.querySelector('[data-workbench-status]')) return;
        const status = document.createElement('div');
        status.className = 'workbench-status';
        status.dataset.workbenchStatus = '';
        status.innerHTML = '<span class="status-pulse" aria-hidden="true"></span><span>LIVE</span><span class="status-divider" aria-hidden="true"></span><span data-window-count>0 windows</span>';
        header.insertBefore(status, header.querySelector('.header-actions'));
    }

    function installWindowInteractions() {
        const desktop = document.getElementById('desktop');
        if (!desktop) return;
        const observer = new MutationObserver(() => {
            updateStatus();
            desktop.querySelectorAll('.window:not([data-ambient-bound])').forEach((win) => {
                win.dataset.ambientBound = 'true';
                win.addEventListener('pointermove', (event) => {
                    const rect = win.getBoundingClientRect();
                    win.style.setProperty('--spot-x', `${event.clientX - rect.left}px`);
                    win.style.setProperty('--spot-y', `${event.clientY - rect.top}px`);
                }, { passive: true });
                win.addEventListener('pointerdown', () => {
                    win.classList.add('is-pressing');
                    setTimeout(() => win.classList.remove('is-pressing'), 180);
                }, { passive: true });
            });
        });
        observer.observe(desktop, { childList: true });
        updateStatus();
    }

    function installShortcuts() {
        document.addEventListener('keydown', (event) => {
            if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
            const target = event.target;
            if (target && /INPUT|TEXTAREA|SELECT/.test(target.tagName)) return;
            if (event.key.toLowerCase() === 'n' && typeof window.createNewWindow === 'function') {
                event.preventDefault();
                window.createNewWindow();
            }
            if (event.key.toLowerCase() === 's' && typeof window.openSettings === 'function') {
                event.preventDefault();
                window.openSettings();
            }
        });
    }

    function init() {
        installStatus();
        installWindowInteractions();
        installShortcuts();
        document.addEventListener('pointermove', (event) => {
            setPointer(event.clientX, event.clientY);
            schedule();
        }, { passive: true });
        document.addEventListener('pointerdown', ripple, { passive: true });
        window.addEventListener('resize', () => {
            pointer.tx = Math.min(pointer.tx, innerWidth);
            pointer.ty = Math.min(pointer.ty, innerHeight);
            schedule();
        }, { passive: true });
        reducedMotion.addEventListener?.('change', schedule);
        schedule();
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
    else init();
})();
