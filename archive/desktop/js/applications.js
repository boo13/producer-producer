(function initApplicationsWindow() {
    const state = {
        filter: 'all',
        isLoading: false,
        items: [],
        root: null,
        listEl: null,
    };

    const FILTERS = ['all', 'todo', 'applied'];

    const ensureElements = () => {
        if (state.root && state.listEl) {
            return true;
        }
        state.root = document.querySelector('.applications-window');
        state.listEl = state.root?.querySelector('.applications-list') || null;
        return Boolean(state.root && state.listEl);
    };

    const renderPlaceholder = (message) => {
        if (!ensureElements()) {
            return;
        }
        state.listEl.innerHTML = `<p class="window-placeholder">${message}</p>`;
    };

    const formatLocation = (opp) => {
        const parts = [];
        if (opp.location_city) parts.push(opp.location_city);
        if (opp.location_state) parts.push(opp.location_state);
        return parts.length ? parts.join(', ') : (opp.location_raw || 'Location TBD');
    };

    const renderCards = () => {
        if (!ensureElements()) {
            return;
        }

        if (!state.items.length) {
            state.listEl.innerHTML = '<p class="window-placeholder">No applications yet. Save an opportunity to get started.</p>';
            return;
        }

        const fragment = document.createDocumentFragment();

        state.items.forEach((item) => {
            const data = item.opportunity || item;
            const card = document.createElement('article');
            card.className = 'application-card';
            card.dataset.opportunityId = String(data.id);

            const company = data.company_name || 'Unknown Company';
            const location = formatLocation(data);
            const statusLabel = item.status ? item.status.toUpperCase() : 'TODO';

            card.innerHTML = `
                <div class="application-card__header">
                    <div>
                        <p class="application-card__title">${escapeHtml(data.title)}</p>
                        <p class="application-card__meta">${escapeHtml(company)} · ${escapeHtml(location)}</p>
                    </div>
                    <span class="application-card__status application-card__status--${statusLabel.toLowerCase()}">${statusLabel}</span>
                </div>
                <div class="application-card__actions">
                    ${data.apply_url ? `<button type="button" class="app-card-btn app-card-btn--link" data-action="apply">Apply ↗</button>` : ''}
                    <button type="button" class="app-card-btn" data-action="mark-applied">Mark Applied</button>
                </div>
            `;

            card.querySelectorAll('.app-card-btn').forEach((btn) => {
                btn.addEventListener('click', () => {
                    handleCardAction(btn.getAttribute('data-action'), data);
                });
            });

            fragment.appendChild(card);
        });

        state.listEl.innerHTML = '';
        state.listEl.appendChild(fragment);
    };

    const handleCardAction = async (action, opportunity) => {
        if (!action) return;

        if (action === 'apply') {
            window.AudioManager?.play('pop');
            window.open(opportunity.apply_url, '_blank', 'noopener');
            return;
        }

        if (action === 'mark-applied') {
            try {
                state.listEl?.classList.add('is-loading');
                await window.api.updateOpportunityStatus(opportunity.id, 'applied');
                window.AudioManager?.play('bloop');
                window.authFunctions?.showSuccessMessage('Marked as applied!');
                loadApplications();
            } catch (err) {
                window.authFunctions?.showErrorMessage(err.message || 'Failed to update application.');
            } finally {
                state.listEl?.classList.remove('is-loading');
            }
        }
    };

    const escapeHtml = (text = '') => {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    };

    const fetchByStatus = async (status) => {
        return await window.api.getUserOpportunities({ status_filter: status });
    };

    const loadApplications = async () => {
        if (!ensureElements()) {
            return;
        }

        if (!window.api.isAuthenticated()) {
            renderPlaceholder('Log in to track your applications.');
            return;
        }

        if (state.isLoading) {
            return;
        }

        state.isLoading = true;
        renderPlaceholder('Loading applications...');

        try {
            let responses = [];
            if (state.filter === 'all') {
                responses = await Promise.all(['todo', 'applied'].map(fetchByStatus));
            } else {
                responses = [await fetchByStatus(state.filter)];
            }

            state.items = responses.flat();
            renderCards();
        } catch (err) {
            console.error(err);
            renderPlaceholder('Unable to load applications right now.');
        } finally {
            state.isLoading = false;
        }
    };

    const setFilter = (nextFilter) => {
        if (!FILTERS.includes(nextFilter)) {
            return;
        }
        state.filter = nextFilter;

        if (!ensureElements()) {
            return;
        }

        state.root.querySelectorAll('.applications-filter').forEach((btn) => {
            const isActive = btn.dataset.filter === state.filter;
            btn.classList.toggle('is-active', isActive);
            btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
        });

        loadApplications();
    };

    const bindFilters = () => {
        if (!ensureElements()) {
            return;
        }

        state.root.querySelectorAll('.applications-filter').forEach((btn) => {
            btn.addEventListener('click', () => {
                setFilter(btn.dataset.filter || 'all');
            });
        });
    };

    const handleDesktopWindowEvent = (event) => {
        if (event.detail?.id === 'applications-window') {
            loadApplications();
        }
    };

    const handleAuthChange = (event) => {
        if (!event.detail?.isAuthenticated) {
            state.items = [];
            renderPlaceholder('Log in to track your applications.');
        }
    };

    document.addEventListener('desktopWindow:opened', handleDesktopWindowEvent);
    document.addEventListener('pp:auth-changed', handleAuthChange);

    if (ensureElements()) {
        bindFilters();
    }

    window.applicationsWindow = {
        init: () => {
            if (ensureElements()) {
                bindFilters();
            }
        },
        refresh: loadApplications,
        notifyStatusChange: (status) => {
            if (['todo', 'applied'].includes(status)) {
                loadApplications();
            }
        }
    };
})();
