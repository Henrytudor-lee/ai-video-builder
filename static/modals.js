// 统一弹框组件。替代原生 alert/confirm/prompt。
// 用法：
//   await modals.alert('保存成功')
//   const ok = await modals.confirm('确定要删除？', {danger: true, title: '删除项目'})
//   const name = await modals.prompt('项目名？', {defaultValue: '我的第一部短片', title: '新建项目'})
(function () {
  'use strict';

  // 单一容器，所有 modal 都挂这里
  function _container() {
    let el = document.getElementById('modals-root');
    if (!el) {
      el = document.createElement('div');
      el.id = 'modals-root';
      document.body.appendChild(el);
    }
    return el;
  }

  // 关闭一个 modal 实例
  function _close(modalEl, reason) {
    if (!modalEl || modalEl._closed) return;
    modalEl._closed = true;
    modalEl.style.animation = 'modal-fade-out .12s ease-out';
    if (modalEl._cleanup) modalEl._cleanup();
    setTimeout(() => {
      if (modalEl.parentNode) modalEl.parentNode.removeChild(modalEl);
    }, 120);
    if (modalEl._resolve) modalEl._resolve(reason);
    // 焦点回到 opener
    if (modalEl._opener && typeof modalEl._opener.focus === 'function') {
      try { modalEl._opener.focus(); } catch (e) {}
    }
  }

  // 通用：渲染一个 modal
  // opts: {kind: 'alert'|'confirm'|'prompt', title, message, defaultValue, placeholder,
  //        confirmText, cancelText, danger, multiline}
  function _open(opts) {
    opts = opts || {};
    const kind = opts.kind || 'alert';
    const title = opts.title || (kind === 'confirm' ? '请确认' : kind === 'prompt' ? '请输入' : '提示');
    const message = opts.message || '';
    const confirmText = opts.confirmText || (kind === 'prompt' ? '确定' : (opts.danger ? '删除' : '确定'));
    const cancelText = opts.cancelText || '取消';
    const danger = !!opts.danger;
    const placeholder = opts.placeholder || '';
    const defaultValue = opts.defaultValue || '';
    const multiline = !!opts.multiline;

    const opener = document.activeElement;

    const root = _container();
    const mask = document.createElement('div');
    mask.className = 'modal-mask';
    mask._opener = opener;

    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.style.maxWidth = '460px';

    // 标题
    const hd = document.createElement('div');
    hd.className = 'modal-hd';
    const h3 = document.createElement('h3');
    h3.className = 't-h2';
    h3.textContent = title;
    hd.appendChild(h3);
    const xBtn = document.createElement('button');
    xBtn.className = 'btn btn-ghost btn-sm btn-icon';
    xBtn.setAttribute('aria-label', '关闭');
    xBtn.textContent = '×';
    hd.appendChild(xBtn);
    modal.appendChild(hd);

    // body
    const bd = document.createElement('div');
    bd.className = 'modal-bd';
    if (message) {
      const p = document.createElement('p');
      p.style.cssText = 'white-space: pre-wrap; line-height: 1.55; color: var(--ink-1); font-size: 13px;';
      p.textContent = message;
      bd.appendChild(p);
    }
    let input = null;
    if (kind === 'prompt') {
      if (multiline) {
        input = document.createElement('textarea');
        input.rows = 4;
        input.className = 'textarea';
      } else {
        input = document.createElement('input');
        input.type = 'text';
        input.className = 'input t-mono';
      }
      if (placeholder) input.placeholder = placeholder;
      input.value = defaultValue;
      input.style.marginTop = message ? '12px' : '0';
      bd.appendChild(input);
    }
    modal.appendChild(bd);

    // footer
    const ft = document.createElement('div');
    ft.className = 'modal-ft';

    let cancelResult = (kind === 'confirm' ? false : null);
    let confirmResult = (kind === 'prompt' ? '' : (kind === 'confirm' ? true : undefined));

    if (kind === 'confirm' || kind === 'prompt') {
      const cancelBtn = document.createElement('button');
      cancelBtn.className = 'btn';
      cancelBtn.textContent = cancelText;
      cancelBtn.addEventListener('click', () => _close(mask, cancelResult));
      ft.appendChild(cancelBtn);
    }
    const confirmBtn = document.createElement('button');
    confirmBtn.className = 'btn ' + (danger ? 'btn-danger' : 'btn-primary');
    confirmBtn.textContent = confirmText;
    confirmBtn.addEventListener('click', () => {
      _close(mask, kind === 'prompt' ? (input ? input.value : '') : confirmResult);
    });
    ft.appendChild(confirmBtn);
    modal.appendChild(ft);

    mask.appendChild(modal);
    root.appendChild(mask);

    // 点击 mask 关闭
    mask.addEventListener('click', (e) => {
      if (e.target === mask) _close(mask, cancelResult);
    });

    // 键盘
    const onKey = (e) => {
      if (mask._closed) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        _close(mask, cancelResult);
      } else if (e.key === 'Enter') {
        if (kind === 'prompt' && multiline && !(e.metaKey || e.ctrlKey)) return;
        e.preventDefault();
        if (kind === 'prompt') {
          _close(mask, input ? input.value : '');
        } else if (kind === 'confirm') {
          _close(mask, true);
        } else {
          _close(mask, undefined);
        }
      }
    };
    document.addEventListener('keydown', onKey);
    mask._cleanup = () => document.removeEventListener('keydown', onKey);

    // 自动 focus input
    if (input) {
      setTimeout(() => {
        try { input.focus(); input.select(); } catch (e) {}
      }, 30);
    }

    return new Promise((resolve) => {
      mask._resolve = resolve;
    });
  }

  const modals = {
    alert(message, opts) {
      return _open(Object.assign({kind: 'alert', message: message, title: (opts && opts.title) || '提示'}, opts || {}));
    },
    confirm(message, opts) {
      return _open(Object.assign({kind: 'confirm', message: message}, opts || {})).then(v => v === true);
    },
    prompt(message, opts) {
      return _open(Object.assign({kind: 'prompt', message: message}, opts || {})).then(v => v == null ? null : v);
    },
    // 测试/调试
    hasOpen() {
      return !!document.querySelector('#modals-root .modal-mask');
    },
  };

  window.modals = modals;
})();
