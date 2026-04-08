(function initCompaniesWindow() {
    const state = {
        root: null,
        list: null,
        summary: null,
        selectedCompany: null,
        opportunities: [],
    };

    const ensureElements = () => {
        if (state.root && state.list && state.summary) {
            return true;
        }
        state.root = document.querySelector('.companies-window');
        state.list = state.root?.querySelector('.companies-list') || null;
        state.summary = state.root?.querySelector('.companies-summary') || null;
        return Boolean(state.root && state.list && state.summary);
    };

    const escapeHtml = (text = '') => {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    };

    const aggregateCompanies = () => {
        const map = new Map();

        state.opportunities.forEach((opp) => {
            const company = opp.company_name || 'Unknown Company';
            if (!map.has(company)) {
                map.set(company, { count: 0, sample: opp });
            }
            map.get(company).count += 1;
        });

        return Array.from(map.entries()).map(([company, payload]) => ({
            company,
            count: payload.count,
        }));
    };

    const renderSummary = (total, unique) => {
        if (!ensureElements()) {
            return;
        }

        if (!total) {
            state.summary.innerHTML = '<p class="window-placeholder">Company insights will appear after your opportunities load.</p>';
            return;
        }

        const selectedText = state.selectedCompany ? ` · Filter: ${escapeHtml(state.selectedCompany)}` : '';
        state.summary.innerHTML = `<p>${unique} companies · ${total} matching roles${selectedText}</p>`;
    };

    const handleCompanyClick = (company) => {
        state.selectedCompany = state.selectedCompany === company ? null : company;
        renderList();

        if (state.selectedCompany) {
            window.opportunitiesView?.filterByCompany(state.selectedCompany);
        } else {
            window.opportunitiesView?.clearCompanyFilter?.();
        }
    };

    const renderList = () => {
        if (!ensureElements()) {
            return;
        }

        const data = aggregateCompanies();
        const total = state.opportunities.length;
        const unique = data.length;
        renderSummary(total, unique);

        if (!data.length) {
            state.list.innerHTML = '';
            return;
        }

        const fragment = document.createDocumentFragment();

        data.sort((a, b) => {
            if (b.count !== a.count) {
                return b.count - a.count;
            }
            return a.company.localeCompare(b.company);
        });

        data.forEach(({ company, count }) => {
            const item = document.createElement('li');
            item.className = 'company-row';

            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'company-chip';
            button.dataset.company = company;
            button.innerHTML = `
                <span class="company-chip__name">${escapeHtml(company)}</span>
                <span class="company-chip__count">${count}</span>
            `;

            if (state.selectedCompany === company) {
                button.classList.add('is-active');
                button.setAttribute('aria-pressed', 'true');
            } else {
                button.setAttribute('aria-pressed', 'false');
            }

            button.addEventListener('click', () => handleCompanyClick(company));

            item.appendChild(button);
            fragment.appendChild(item);
        });

        state.list.innerHTML = '';
        state.list.appendChild(fragment);
    };

    document.addEventListener('desktopWindow:opened', (event) => {
        if (event.detail?.id === 'companies-window') {
            renderList();
        }
    });

    ensureElements();

    window.companiesWindow = {
        setOpportunities(opportunities = []) {
            state.opportunities = opportunities;
            renderList();
        },
        clearSelection() {
            state.selectedCompany = null;
            renderList();
        }
    };
})();
