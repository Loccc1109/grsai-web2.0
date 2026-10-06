(() => {
    const root = document.documentElement;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let raf = 0;

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
        document.addEventListener('pointerdown', ripple, { passive: true });
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
    else init();
})();
