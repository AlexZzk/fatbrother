/* ============================================
   胖兄弟外卖小程序 - Interactive Prototype JS
   ============================================ */

const App = {
  currentPage: 'home',
  pageHistory: [],
  cart: {},        // { merchantId: [ {product, specs, qty, subtotal} ] }
  currentMerchant: null,

  // ---- Navigation ----
  navigateTo(pageId, pushHistory = true) {
    const currentEl = document.querySelector('.page.active');
    const targetEl = document.getElementById('page-' + pageId);
    if (!targetEl || targetEl === currentEl) return;

    if (pushHistory && currentEl) {
      this.pageHistory.push(this.currentPage);
    }

    if (currentEl) currentEl.classList.remove('active');
    targetEl.classList.add('active');
    this.currentPage = pageId;

    // Reset scroll
    const body = targetEl.querySelector('.page-body');
    if (body) body.scrollTop = 0;

    this.updateTabBar(pageId);
  },

  navigateBack() {
    if (this.pageHistory.length > 0) {
      const prevPage = this.pageHistory.pop();
      this.navigateTo(prevPage, false);
    }
  },

  updateTabBar(pageId) {
    const tabPages = ['home', 'orders', 'mine'];
    document.querySelectorAll('.tab-item').forEach(item => {
      item.classList.toggle('active', item.dataset.page === pageId);
    });
  },

  // ---- Cart ----
  getCart(merchantId) {
    if (!this.cart[merchantId]) this.cart[merchantId] = [];
    return this.cart[merchantId];
  },

  addToCart(merchantId, item) {
    const cart = this.getCart(merchantId);
    // Check if same product with same specs exists
    const existIdx = cart.findIndex(c =>
      c.productId === item.productId &&
      JSON.stringify(c.specs) === JSON.stringify(item.specs)
    );
    if (existIdx >= 0) {
      cart[existIdx].qty += item.qty;
      cart[existIdx].subtotal = cart[existIdx].qty * cart[existIdx].unitPrice;
    } else {
      cart.push({ ...item });
    }
    this.updateCartUI(merchantId);
    this.animateCartBounce();
  },

  updateCartQty(merchantId, index, delta) {
    const cart = this.getCart(merchantId);
    if (!cart[index]) return;
    cart[index].qty += delta;
    if (cart[index].qty <= 0) {
      cart.splice(index, 1);
    } else {
      cart[index].subtotal = cart[index].qty * cart[index].unitPrice;
    }
    this.updateCartUI(merchantId);
    this.renderCartPopup(merchantId);
  },

  clearCart(merchantId) {
    this.cart[merchantId] = [];
    this.updateCartUI(merchantId);
    this.closePopup('cart-popup');
  },

  getCartTotal(merchantId) {
    const cart = this.getCart(merchantId);
    return cart.reduce((sum, item) => sum + item.subtotal, 0);
  },

  getCartCount(merchantId) {
    const cart = this.getCart(merchantId);
    return cart.reduce((sum, item) => sum + item.qty, 0);
  },

  updateCartUI(merchantId) {
    const total = this.getCartTotal(merchantId);
    const count = this.getCartCount(merchantId);

    const cartBar = document.getElementById('cart-bar');
    if (!cartBar) return;

    const badge = cartBar.querySelector('.cart-badge');
    const info = cartBar.querySelector('.cart-info');
    const totalEl = cartBar.querySelector('.cart-total');
    const checkoutBtn = cartBar.querySelector('.cart-checkout-btn');

    if (count > 0) {
      badge.textContent = count;
      badge.style.display = 'flex';
      info.textContent = '已选' + count + '件';
      totalEl.textContent = '¥' + (total / 100).toFixed(2);
      totalEl.style.display = 'block';
      checkoutBtn.classList.remove('btn-disabled');
      cartBar.classList.add('has-items');
    } else {
      badge.style.display = 'none';
      info.textContent = '购物车是空的';
      totalEl.style.display = 'none';
      checkoutBtn.classList.add('btn-disabled');
      cartBar.classList.remove('has-items');
    }
  },

  animateCartBounce() {
    const icon = document.querySelector('.cart-icon-wrap');
    if (icon) {
      icon.classList.add('anim-bounce');
      setTimeout(() => icon.classList.remove('anim-bounce'), 300);
    }
  },

  // ---- Popups ----
  openPopup(popupId) {
    const overlay = document.getElementById('overlay');
    const popup = document.getElementById(popupId);
    if (overlay) { overlay.classList.add('show'); }
    if (popup) {
      popup.classList.add('show');
      // prevent body scroll
    }
  },

  closePopup(popupId) {
    const overlay = document.getElementById('overlay');
    const popup = document.getElementById(popupId);
    if (popup) popup.classList.remove('show');
    // Check if any popup is still open
    const anyOpen = document.querySelector('.popup-bottom.show');
    if (!anyOpen && overlay) overlay.classList.remove('show');
  },

  closeAllPopups() {
    document.querySelectorAll('.popup-bottom.show').forEach(p => p.classList.remove('show'));
    const overlay = document.getElementById('overlay');
    if (overlay) overlay.classList.remove('show');
  },

  // ---- Spec Popup ----
  openSpecPopup(product) {
    this.currentSpecProduct = product;
    this.specSelections = {};
    this.specQty = 1;

    const popup = document.getElementById('spec-popup');
    const nameEl = popup.querySelector('.spec-product-name');
    const priceEl = popup.querySelector('.spec-product-price');
    const groupsEl = popup.querySelector('.spec-groups');
    const qtyEl = popup.querySelector('.spec-qty-value');
    const totalEl = popup.querySelector('.spec-total');

    nameEl.textContent = product.name;
    priceEl.textContent = '¥' + (product.basePrice / 100).toFixed(0) + '起';
    qtyEl.textContent = '1';

    // Render spec groups
    let html = '';
    product.specGroups.forEach((group, gi) => {
      const requiredTag = group.required
        ? '<span class="tag tag-required">必选</span>'
        : '';
      const multiTag = group.multiSelect
        ? '<span class="tag tag-default">可多选</span>'
        : '';

      html += `<div class="spec-group" data-group="${gi}">
        <div class="spec-group-title">${group.name} ${requiredTag} ${multiTag}</div>
        <div class="spec-options">`;

      group.items.forEach((item, ii) => {
        const deltaText = item.priceDelta > 0
          ? '<span class="price-delta">+' + (item.priceDelta / 100) + '</span>'
          : item.priceDelta < 0
            ? '<span class="price-delta">' + (item.priceDelta / 100) + '</span>'
            : '';
        html += `<div class="spec-option" data-group="${gi}" data-item="${ii}" onclick="App.toggleSpec(${gi}, ${ii})">${item.name}${deltaText}</div>`;
      });

      html += `</div></div>`;
    });

    groupsEl.innerHTML = html;
    this.updateSpecTotal();
    this.openPopup('spec-popup');
  },

  toggleSpec(groupIndex, itemIndex) {
    const product = this.currentSpecProduct;
    const group = product.specGroups[groupIndex];

    if (!this.specSelections[groupIndex]) {
      this.specSelections[groupIndex] = new Set();
    }

    const sel = this.specSelections[groupIndex];

    if (group.multiSelect) {
      if (sel.has(itemIndex)) {
        sel.delete(itemIndex);
      } else {
        sel.add(itemIndex);
      }
    } else {
      // Single select
      if (sel.has(itemIndex)) {
        if (!group.required) sel.clear();
      } else {
        sel.clear();
        sel.add(itemIndex);
      }
    }

    // Update UI
    document.querySelectorAll(`.spec-option[data-group="${groupIndex}"]`).forEach(el => {
      el.classList.toggle('selected', sel.has(parseInt(el.dataset.item)));
    });

    this.updateSpecTotal();
  },

  updateSpecTotal() {
    const product = this.currentSpecProduct;
    let total = product.basePrice;
    let allRequiredSelected = true;

    product.specGroups.forEach((group, gi) => {
      const sel = this.specSelections[gi] || new Set();
      if (group.required && sel.size === 0) {
        allRequiredSelected = false;
      }
      sel.forEach(ii => {
        total += group.items[ii].priceDelta;
      });
    });

    total *= this.specQty;

    const totalEl = document.querySelector('.spec-total');
    const addBtn = document.querySelector('.spec-add-btn');

    totalEl.textContent = '¥' + (total / 100).toFixed(2);

    if (allRequiredSelected) {
      addBtn.classList.remove('btn-disabled');
      addBtn.textContent = '加入购物车';
    } else {
      addBtn.classList.add('btn-disabled');
      // Find first unselected required group
      const unselected = product.specGroups.find((g, i) =>
        g.required && (!this.specSelections[i] || this.specSelections[i].size === 0)
      );
      addBtn.textContent = '请选择' + (unselected ? unselected.name : '规格');
    }
  },

  changeSpecQty(delta) {
    this.specQty = Math.max(1, Math.min(99, this.specQty + delta));
    document.querySelector('.spec-qty-value').textContent = this.specQty;
    this.updateSpecTotal();
  },

  confirmAddToCart() {
    const product = this.currentSpecProduct;
    // Check required
    let allRequired = true;
    product.specGroups.forEach((group, gi) => {
      if (group.required && (!this.specSelections[gi] || this.specSelections[gi].size === 0)) {
        allRequired = false;
      }
    });
    if (!allRequired) return;

    // Build specs summary
    const specs = [];
    let priceDelta = 0;
    product.specGroups.forEach((group, gi) => {
      const sel = this.specSelections[gi] || new Set();
      sel.forEach(ii => {
        specs.push({
          groupName: group.name,
          itemName: group.items[ii].name,
          priceDelta: group.items[ii].priceDelta
        });
        priceDelta += group.items[ii].priceDelta;
      });
    });

    const unitPrice = product.basePrice + priceDelta;
    const item = {
      productId: product.id,
      productName: product.name,
      specs: specs,
      specSummary: specs.map(s => s.itemName).join('/'),
      unitPrice: unitPrice,
      qty: this.specQty,
      subtotal: unitPrice * this.specQty
    };

    this.addToCart('merchant_demo', item);
    this.closePopup('spec-popup');
    this.showToast('已加入购物车');
  },

  // ---- Cart Popup ----
  renderCartPopup(merchantId) {
    const cart = this.getCart(merchantId);
    const listEl = document.querySelector('.cart-popup-list');
    if (!listEl) return;

    if (cart.length === 0) {
      this.closePopup('cart-popup');
      return;
    }

    let html = '';
    cart.forEach((item, i) => {
      html += `<div class="cart-popup-item">
        <div class="cart-popup-item-info">
          <div class="cart-popup-item-name">${item.productName}</div>
          ${item.specSummary ? `<div class="cart-popup-item-spec">${item.specSummary}</div>` : ''}
        </div>
        <div class="cart-popup-item-right">
          <div class="cart-popup-item-price">¥${(item.unitPrice / 100).toFixed(2)}</div>
          <div class="stepper">
            <button class="stepper-btn stepper-minus" onclick="App.updateCartQty('merchant_demo', ${i}, -1)">-</button>
            <span class="stepper-value">${item.qty}</span>
            <button class="stepper-btn stepper-plus" onclick="App.updateCartQty('merchant_demo', ${i}, 1)">+</button>
          </div>
        </div>
      </div>`;
    });

    listEl.innerHTML = html;

    const totalEl = document.querySelector('.cart-popup-total-price');
    if (totalEl) {
      totalEl.textContent = '¥' + (this.getCartTotal(merchantId) / 100).toFixed(2);
    }
  },

  openCartPopup() {
    const count = this.getCartCount('merchant_demo');
    if (count === 0) return;
    this.renderCartPopup('merchant_demo');
    this.openPopup('cart-popup');
  },

  // ---- Simple add (no spec) ----
  simpleAdd(product) {
    const item = {
      productId: product.id,
      productName: product.name,
      specs: [],
      specSummary: '',
      unitPrice: product.basePrice,
      qty: 1,
      subtotal: product.basePrice
    };
    this.addToCart('merchant_demo', item);
    this.showToast('已加入购物车');
  },

  // ---- Order Confirm ----
  goToOrderConfirm() {
    const count = this.getCartCount('merchant_demo');
    if (count === 0) return;

    const cart = this.getCart('merchant_demo');
    const listEl = document.getElementById('confirm-items');
    let html = '';
    cart.forEach(item => {
      const specText = item.specSummary ? ` (${item.specSummary})` : '';
      html += `<div class="confirm-item">
        <div class="confirm-item-name">${item.productName}${specText}</div>
        <div class="confirm-item-right">
          <span class="confirm-item-qty">x${item.qty}</span>
          <span class="confirm-item-price">¥${(item.subtotal / 100).toFixed(2)}</span>
        </div>
      </div>`;
    });
    listEl.innerHTML = html;

    const total = this.getCartTotal('merchant_demo');
    document.getElementById('confirm-subtotal').textContent = '¥' + (total / 100).toFixed(2);
    document.getElementById('confirm-total').textContent = '¥' + (total / 100).toFixed(2);
    document.getElementById('confirm-total-btn').textContent = '¥' + (total / 100).toFixed(2);

    this.navigateTo('order-confirm');
  },

  submitOrder() {
    this.showToast('下单成功！', 'success');
    this.cart['merchant_demo'] = [];
    this.updateCartUI('merchant_demo');
    setTimeout(() => {
      this.navigateTo('order-result', true);
    }, 800);
  },

  // ---- Toast ----
  showToast(message, type = 'success') {
    let toast = document.getElementById('global-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'global-toast';
      document.querySelector('.phone-frame').appendChild(toast);
    }

    const icon = type === 'success' ? '&#10003;' : type === 'error' ? '&#10007;' : 'i';
    const bgColor = type === 'success' ? 'var(--color-success)' : type === 'error' ? 'var(--color-danger)' : 'var(--b-primary)';

    toast.innerHTML = `<span style="display:inline-flex;align-items:center;gap:6px;"><span style="width:18px;height:18px;border-radius:50%;background:${bgColor};color:#fff;display:inline-flex;align-items:center;justify-content:center;font-size:11px;">${icon}</span>${message}</span>`;
    toast.style.cssText = `
      position:absolute;top:100px;left:50%;transform:translateX(-50%) translateY(-10px);
      background:rgba(0,0,0,0.75);color:#fff;padding:10px 20px;border-radius:20px;
      font-size:13px;z-index:999;opacity:0;transition:all 0.3s;white-space:nowrap;
    `;

    requestAnimationFrame(() => {
      toast.style.opacity = '1';
      toast.style.transform = 'translateX(-50%) translateY(0)';
    });

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(-50%) translateY(-10px)';
    }, 1500);
  },

  // ---- Filter Tabs ----
  switchFilterTab(tabGroup, tabName) {
    const tabs = document.querySelectorAll(`.filter-tab[data-group="${tabGroup}"]`);
    tabs.forEach(t => {
      t.classList.remove('active', 'b-active');
      if (t.dataset.tab === tabName) {
        t.classList.add(tabGroup.startsWith('b-') ? 'b-active' : 'active');
      }
    });
  },

  // ---- B-end: Toggle Business Status ----
  toggleBusinessStatus() {
    const statusEl = document.getElementById('b-status-indicator');
    const statusText = document.getElementById('b-status-text');
    const statusBtn = document.getElementById('b-status-btn');
    const statusDuration = document.getElementById('b-status-duration');

    if (statusEl.classList.contains('open')) {
      statusEl.classList.remove('open');
      statusEl.classList.add('closed');
      statusText.textContent = '休息中';
      statusBtn.textContent = '开始营业';
      statusBtn.className = 'btn btn-primary-lg b-end';
      statusBtn.style.background = 'var(--color-success)';
      statusDuration.textContent = '';
    } else {
      statusEl.classList.remove('closed');
      statusEl.classList.add('open');
      statusText.textContent = '营业中';
      statusBtn.textContent = '结束营业';
      statusBtn.className = 'btn btn-primary-lg';
      statusBtn.style.background = 'var(--color-danger)';
      statusDuration.textContent = '已营业 2小时30分';
      App.showToast('已开始营业，定位已更新', 'success');
    }
  },

  // ---- B-end: Accept / Reject Order ----
  acceptOrder(el) {
    const card = el.closest('.b-order-card');
    if (card) {
      card.style.transition = 'all 0.3s';
      card.style.opacity = '0';
      card.style.transform = 'translateX(100%)';
      setTimeout(() => card.remove(), 300);
      this.showToast('已接单', 'success');
    }
  },

  rejectOrder() {
    this.openPopup('reject-popup');
  },

  confirmReject() {
    this.closePopup('reject-popup');
    this.showToast('已拒单，将自动退款', 'info');
  },

  // ---- B-end: Mark Ready ----
  markReady(el) {
    const card = el.closest('.b-order-card');
    if (card) {
      card.style.transition = 'all 0.3s';
      card.style.opacity = '0';
      setTimeout(() => card.remove(), 300);
      this.showToast('已出餐', 'success');
    }
  },

  // ---- B-end: Menu Toggle ----
  toggleProductStatus(el) {
    const statusTag = el.parentElement.querySelector('.product-status-tag');
    if (statusTag.classList.contains('tag-success')) {
      statusTag.classList.remove('tag-success');
      statusTag.classList.add('tag-default');
      statusTag.textContent = '已下架';
      el.textContent = '上架';
    } else {
      statusTag.classList.remove('tag-default');
      statusTag.classList.add('tag-success');
      statusTag.textContent = '售卖中';
      el.textContent = '下架';
    }
  },

  // ---- New Order Alert (B-end simulation) ----
  simulateNewOrder() {
    const alert = document.getElementById('new-order-alert');
    if (alert) {
      alert.classList.add('show');
      // Vibrate if supported
      if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
    }
  },

  dismissOrderAlert() {
    const alert = document.getElementById('new-order-alert');
    if (alert) alert.classList.remove('show');
  },

  // ---- Category left-right scroll sync ----
  initMenuScroll() {
    const categories = document.querySelectorAll('.menu-category-item');
    const sections = document.querySelectorAll('.menu-section');
    const menuContent = document.querySelector('.menu-content');

    if (!menuContent || !categories.length) return;

    categories.forEach((cat, i) => {
      cat.addEventListener('click', () => {
        categories.forEach(c => c.classList.remove('active'));
        cat.classList.add('active');
        if (sections[i]) {
          sections[i].scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      });
    });
  },

  // ---- Init ----
  init() {
    // Tab bar clicks
    document.querySelectorAll('.tab-item').forEach(item => {
      item.addEventListener('click', () => {
        const page = item.dataset.page;
        if (page) {
          this.pageHistory = [];
          this.navigateTo(page);
        }
      });
    });

    // Overlay click closes popups
    const overlay = document.getElementById('overlay');
    if (overlay) {
      overlay.addEventListener('click', () => this.closeAllPopups());
    }

    // Init menu scroll sync
    this.initMenuScroll();

    // Start on home
    this.navigateTo('home', false);
    this.updateCartUI('merchant_demo');
  }
};

document.addEventListener('DOMContentLoaded', () => App.init());
