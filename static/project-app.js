// 分镜工作流前端
// 用 Alpine.data() 注册，避开某些环境（如 mavis/MiniMax Code 内嵌浏览器注入的 hook）
// 把 alpine init 时机提前到 JS 加载完后再执行 x-data="projectApp()"
document.addEventListener('alpine:init', () => {
  window.Alpine.data('projectApp', () => ({
    // 状态
    projects: [],
    // 项目列表多选模式
    selectMode: false,
    selectedIds: [],
    // 重要：currentProject 默认是占位空对象，而不是 null
    // 因为 Alpine 初始化时会立即求值所有 x-text 表达式（包括 x-show 隐藏的 modal 里的）
    // 用 null 会导致 currentProject.name 报 null 错误，污染整个组件
    currentProject: { name: '', script: '', aspect_ratio: '16:9', characters: [], storyboards: [], grid_bundles: [] },
    currentStep: 1,
    steps: ['剧本', '角色', '分镜', '导出'],
    config: { has_key: false, key_preview: '', ffmpeg_available: false },
    projectLoaded: false,

    // 表单临时态
    showAddChar: false,
    newChar: { name: '', description: '', file: null },
    showAddSb: false,
    newSb: { name: '', script: '' },

    // 头脑风暴
    showBrainstorm: false,
    brainstormBrief: '',
    brainstormCount: 8,
    brainstormStyleHint: '',
    brainstormIdeas: [],
    brainstormLoading: false,
    brainstormError: '',

    // 角色 AI（抽取 + 换一版）
    generatingCharacters: false,
    rewritingChar: null,
    showRewriteModal: false,
    rewriteCharId: null,

    // 图片灯箱：{kind, sbId, idx} 或 {kind:'single', src, title} 或 null
    lightbox: null,
    rewriteChar: null,
    rewriteOptions: [],
    rewriteLoading: false,
    rewriteError: '',
    generatingTurnaround: null,
    aiError: '',

    // 渲染状态
    generatingChar: null,
    generatingSb: null,
    generatingStoryboards: false,
    renderingSb: null,
    rendering: false,
    composingGrid: false,
    useSubjectFor: null,

    // 选项
    aspectRatios: [
      { value: '16:9', label: '16:9 横屏' },
      { value: '9:16', label: '9:16 竖屏' },
      { value: '1:1', label: '1:1 方形' },
      { value: '4:3', label: '4:3 传统' },
      { value: '3:2', label: '3:2 照片' },
    ],

    renderOpts: { transition: 'fade', transition_duration: 0.5 },

    // 风格选择器（AI 一键生成分镜前必选）
    artStyles: [],
    selectedStyleCode: '',
    selectedStyleDesc: '',

    // 九宫格合并
    gridBundle: { duration: 10, resolution: '768P' },

    async init() {
      await this.loadConfig();
      await this.loadProjects();
      await this.loadOptions();
    },

    async loadOptions() {
      try {
        const r = await fetch('/api/options');
        const d = await r.json();
        const raw = (d.styles && d.styles['艺术风格'] && d.styles['艺术风格'].items) || [];
        this.artStyles = raw;
      } catch (e) {
        console.error('loadOptions failed', e);
      }
    },

    getStyleByCode(code) {
      return this.artStyles.find(s => s.code === code);
    },

    async loadConfig() {
      const r = await fetch('/api/config');
      this.config = await r.json();
    },

    async loadProjects() {
      const r = await fetch('/api/projects');
      this.projects = await r.json();
    },

    // ---- 项目 ----
    async createProject() {
      const name = await modals.prompt('项目名？', {defaultValue: '我的第一部短片', title: '请输入'});
      if (!name) return;
      const r = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, script: '', aspect_ratio: '16:9' }),
      });
      const p = await r.json();
      await this.loadProjects();
      this.openProject(p.id);
    },

    async openProject(id) {
      const r = await fetch(`/api/projects/${id}`);
      this.currentProject = await r.json();
      // 同步 simple_prompt 到顶层方便 x-model
      for (const sb of (this.currentProject.storyboards || [])) {
        sb.simple_prompt = (sb.prompt_data && sb.prompt_data.simple_prompt) || sb.script || '';
      }
      this.projectLoaded = true;
      this.currentStep = 1;
    },

    closeProject() {
      // 不用 null，避免 Alpine 模板里 currentProject.X 报错
      this.currentProject = { name: '', script: '', aspect_ratio: '16:9', characters: [], storyboards: [], grid_bundles: [] };
      this.projectLoaded = false;
      this.currentStep = 1;
      this.loadProjects();
    },

    async saveProject() {
      if (!this.currentProject) return;
      await fetch(`/api/projects/${this.currentProject.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: this.currentProject.name,
          script: this.currentProject.script,
          aspect_ratio: this.currentProject.aspect_ratio,
        }),
      });
    },

    async deleteProject(id) {
      const ok = await modals.confirm('确认删除整个项目？', {title: '删除确认', danger: true}); if (!ok) return;
      await fetch(`/api/projects/${id}`, { method: 'DELETE' });
      await this.loadProjects();
    },

    // ---- 项目列表多选 ----
    toggleSelectMode() {
      this.selectMode = !this.selectMode;
      if (!this.selectMode) this.selectedIds = [];  // 退出时清空
    },
    onProjCardClick(p) {
      if (this.selectMode) {
        this.toggleSelect(p.id);
      } else {
        this.openProject(p.id);
      }
    },
    toggleSelect(id) {
      const i = this.selectedIds.indexOf(id);
      if (i >= 0) this.selectedIds.splice(i, 1);
      else this.selectedIds.push(id);
    },
    isAllSelected() {
      return this.projects.length > 0 && this.selectedIds.length === this.projects.length;
    },
    selectAll() {
      if (this.isAllSelected()) {
        this.selectedIds = [];
      } else {
        this.selectedIds = this.projects.map(p => p.id);
      }
    },
    invertSelection() {
      this.selectedIds = this.projects.filter(p => !this.selectedIds.includes(p.id)).map(p => p.id);
    },
    async batchDeleteProjects() {
      if (this.selectedIds.length === 0) return;
      // 找到要删的项目名（用于提示）
      const names = this.selectedIds.map(id => {
        const p = this.projects.find(x => x.id === id);
        return p ? p.name : id;
      });
      const preview = names.slice(0, 5).join('、');
      const more = names.length > 5 ? ` 等 ${names.length} 个项目` : '';
      const ok = await modals.confirm(
        `将永久删除：${preview}${more}。此操作不可恢复！`,
        { title: `批量删除 ${this.selectedIds.length} 个项目`, danger: true, confirmText: '全部删除' }
      );
      if (!ok) return;
      try {
        const r = await fetch('/api/projects/batch-delete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids: this.selectedIds }),
        });
        const data = await r.json();
        if (!r.ok) throw new Error(data.detail || `HTTP ${r.status}`);
        const deletedCount = data.deleted_count || 0;
        await this.loadProjects();
        this.selectedIds = [];
        // 删除完成后退出选择模式（避免批量操作条还显示但列表是空的）
        this.selectMode = false;
        if (deletedCount > 0) {
          await modals.alert(`已删除 ${deletedCount} 个项目${data.missing?.length ? `（${data.missing.length} 个不存在）` : ''}`,
            { title: '删除完成' });
        }
      } catch (e) {
        await modals.alert('批量删除失败：' + e.message, { title: '出错了', danger: true });
      }
    },

    // ---- 角色 ----
    async addCharacter() {
      if (!this.newChar.name) return;
      const fd = new FormData();
      fd.append('name', this.newChar.name);
      fd.append('description', this.newChar.description);
      if (this.newChar.file) fd.append('image', this.newChar.file);
      const r = await fetch(`/api/projects/${this.currentProject.id}/characters`, {
        method: 'POST', body: fd,
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        await modals.alert('添加失败：' + (d.detail || `HTTP ${r.status}`), {title: '出错了', danger: true});
        return;
      }
      await this.refreshProject();
      this.newChar = { name: '', description: '', file: null };
      this.showAddChar = false;
    },

    uploadCharImage(e) {
      this.newChar.file = e.target.files[0];
    },

    async generateCharacterImages(cid) {
      this.generatingChar = cid;
      try {
        const r = await fetch(`/api/projects/${this.currentProject.id}/characters/${cid}/generate?n=3`, { method: 'POST' });
        if (!r.ok) {
          const d = await r.json().catch(() => ({}));
          throw new Error(d.detail || `HTTP ${r.status}`);
        }
        await this.refreshProject();
      } catch (e) {
        await modals.alert('生成失败：' + e.message, {title: '出错了', danger: true});
      } finally {
        this.generatingChar = null;
      }
    },

    async selectCharacterImage(cid, imgPath) {
      const fd = new FormData();
      fd.append('image_path', imgPath);
      const r = await fetch(`/api/projects/${this.currentProject.id}/characters/${cid}/select`, { method: 'POST', body: fd });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        await modals.alert('选择失败：' + (d.detail || `HTTP ${r.status}`), {title: '出错了', danger: true});
        return;
      }
      await this.refreshProject();
    },

    async deleteCharacter(cid) {
      const ok = await modals.confirm('删除此角色？', {title: '删除确认', danger: true}); if (!ok) return;
      await fetch(`/api/projects/${this.currentProject.id}/characters/${cid}`, { method: 'DELETE' });
      await this.refreshProject();
    },

    async updateCharacter(cid, patch) {
      try {
        const r = await fetch(`/api/projects/${this.currentProject.id}/characters/${cid}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(patch),
        });
        if (!r.ok) throw new Error(await r.text());
        const updated = await r.json();
        // 就地更新，避免整个项目重渲染（保留 useSubjectFor 等状态）
        const idx = this.currentProject.characters.findIndex(c => c.id === cid);
        if (idx >= 0) this.currentProject.characters[idx] = updated;
      } catch (e) {
        this.aiError = '保存失败：' + e.message;
      }
    },

    // ---- 角色 AI ----
    async aiGenerateCharacters() {
      if (!this.currentProject?.script?.trim()) {
        this.aiError = '请先在 Step 1 填写剧本';
        return;
      }
      const ok = await modals.confirm('AI 将读剧本并追加所有识别出的角色（已有角色不会被覆盖）。继续？', {title: '请确认', danger: false}); if (!ok) return;
      this.generatingCharacters = true;
      try {
        const r = await fetch(`/api/projects/${this.currentProject.id}/characters/ai-generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            script: this.currentProject.script,
            style_hint: this.brainstormStyleHint || '',
          }),
        });
        if (!r.ok) {
          const d = await r.json().catch(() => ({}));
          throw new Error(d.detail || `HTTP ${r.status}`);
        }
        const d = await r.json();
        if (d.characters) this.currentProject.characters = d.characters;
        if (d.added) this.aiError = '';  // clear
      } catch (e) {
        this.aiError = 'AI 抽取失败：' + e.message;
      } finally {
        this.generatingCharacters = false;
      }
    },

    async aiRewriteDescription(cid) {
      const char = this.currentProject.characters.find(c => c.id === cid);
      if (!char || !char.description?.trim()) return;
      this.rewritingChar = cid;
      this.showRewriteModal = true;
      this.rewriteCharId = cid;
      this.rewriteChar = { name: char.name };
      this.rewriteOptions = [];
      this.rewriteLoading = true;
      this.rewriteError = '';
      try {
        const r = await fetch(`/api/projects/${this.currentProject.id}/characters/${cid}/ai-rewrite`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: char.name,
            description: char.description,
            script: this.currentProject.script || '',
            count: 3,
          }),
        });
        if (!r.ok) {
          const d = await r.json().catch(() => ({}));
          throw new Error(d.detail || `HTTP ${r.status}`);
        }
        const d = await r.json();
        this.rewriteOptions = d.options || [];
        if (this.rewriteOptions.length === 0) {
          this.rewriteError = 'AI 没生成出有效描述，请重试';
        }
      } catch (e) {
        this.rewriteError = '生成失败：' + e.message;
      } finally {
        this.rewritingChar = null;
        this.rewriteLoading = false;
      }
    },

    closeRewriteModal() {
      this.showRewriteModal = false;
      this.rewriteOptions = [];
      this.rewriteError = '';
      this.rewriteCharId = null;
      this.rewriteChar = null;
    },

    async applyRewrite(idx) {
      const cid = this.rewriteCharId;
      const newDesc = this.rewriteOptions[idx];
      if (!cid || !newDesc) return;
      // 写回 description 并落库
      const char = this.currentProject.characters.find(c => c.id === cid);
      if (char) char.description = newDesc;
      await this.updateCharacter(cid, { description: newDesc });
      this.closeRewriteModal();
    },

    async generateTurnaround(cid) {
      const char = this.currentProject.characters.find(c => c.id === cid);
      if (!char) return;
      this.generatingTurnaround = cid;
      try {
        const r = await fetch(`/api/projects/${this.currentProject.id}/characters/${cid}/turnaround/generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            description: char.description || '',
            style_hint: '',
            n: 3,
          }),
        });
        if (!r.ok) {
          const d = await r.json().catch(() => ({}));
          throw new Error(d.detail || `HTTP ${r.status}`);
        }
        const updated = await r.json();
        const i = this.currentProject.characters.findIndex(c => c.id === cid);
        if (i >= 0) this.currentProject.characters[i] = updated;
      } catch (e) {
        this.aiError = '三视图生成失败：' + e.message;
      } finally {
        this.generatingTurnaround = null;
      }
    },

    async selectTurnaround(cid, imgPath) {
      try {
        const fd = new FormData();
        fd.append('image_path', imgPath);
        const r = await fetch(`/api/projects/${this.currentProject.id}/characters/${cid}/turnaround/select`, {
          method: 'POST', body: fd,
        });
        if (!r.ok) throw new Error(await r.text());
        const updated = await r.json();
        const i = this.currentProject.characters.findIndex(c => c.id === cid);
        if (i >= 0) this.currentProject.characters[i] = updated;
      } catch (e) {
        this.aiError = '选择失败：' + e.message;
      }
    },

    // ---- 图片灯箱 ----
    // 两种入口：单图（角色头像用）或分镜候选（双轴导航）
    openLightbox(arg, idx) {
      if (typeof arg === 'string') {
        // 单图：角色头像 / 三视图点击
        if (!arg) return;
        this.lightbox = { kind: 'single', src: arg, title: '' };
      } else if (arg && arg.id && Number.isInteger(idx)) {
        // 分镜候选：双轴导航
        this.lightbox = { kind: 'sb', sbId: arg.id, idx: idx };
      }
    },
    openSingleLightbox(src, title) {
      if (!src) return;
      this.lightbox = { kind: 'single', src: src, title: title || '' };
    },
    closeLightbox() {
      this.lightbox = null;
    },
    lightboxKey(e) {
      if (!this.lightbox) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        this.closeLightbox();
      } else if (e.key === 'ArrowLeft' && this.lightbox.kind === 'sb') {
        e.preventDefault();
        this.lightboxPrev();
      } else if (e.key === 'ArrowRight' && this.lightbox.kind === 'sb') {
        e.preventDefault();
        this.lightboxNext();
      } else if (e.key === 'ArrowUp' && this.lightbox.kind === 'sb') {
        e.preventDefault();
        this.lightboxPrevSb();
      } else if (e.key === 'ArrowDown' && this.lightbox.kind === 'sb') {
        e.preventDefault();
        this.lightboxNextSb();
      }
    },
    // ---- lightbox 助手 ----
    _lightboxSb() {
      if (!this.lightbox || this.lightbox.kind !== 'sb') return null;
      return this.currentProject.storyboards.find(s => s.id === this.lightbox.sbId) || null;
    },
    _lightboxSbIdx() {
      // 当前 sb 在 storyboards 数组中的位置
      if (!this.lightbox || this.lightbox.kind !== 'sb') return -1;
      return this.currentProject.storyboards.findIndex(s => s.id === this.lightbox.sbId);
    },
    lightboxImgSrc() {
      if (!this.lightbox) return '';
      if (this.lightbox.kind === 'single') return this.lightbox.src;
      const sb = this._lightboxSb();
      if (!sb) return '';
      const c = (sb.candidates || [])[this.lightbox.idx];
      if (!c) return '';
      return `/files/${this.currentProject.id}/${c}`;
    },
    lightboxTitle() {
      if (!this.lightbox) return '';
      if (this.lightbox.kind === 'single') return this.lightbox.title || '图片';
      const sb = this._lightboxSb();
      return sb ? (sb.name || '分镜') : '';
    },
    lightboxPrompt() {
      if (!this.lightbox || this.lightbox.kind !== 'sb') return '';
      const sb = this._lightboxSb();
      if (!sb) return '';
      const pd = sb.prompt_data || {};
      return pd.simple_prompt || pd.assembled || '';
    },
    lightboxSbIdxLabel() {
      if (!this.lightbox || this.lightbox.kind !== 'sb') return '';
      const i = this._lightboxSbIdx();
      return i >= 0 ? `分镜 ${i + 1}` : '';
    },
    lightboxSbName() {
      if (!this.lightbox || this.lightbox.kind !== 'sb') return '';
      const sb = this._lightboxSb();
      return sb ? (sb.name || '') : '';
    },
    lightboxCounter() {
      if (!this.lightbox) return '';
      if (this.lightbox.kind === 'single') return '';
      const sb = this._lightboxSb();
      if (!sb) return '';
      const total = (sb.candidates || []).length;
      return total ? `${this.lightbox.idx + 1} / ${total}` : '';
    },
    lightboxHasPrev() {
      if (!this.lightbox || this.lightbox.kind !== 'sb') return false;
      return this.lightbox.idx > 0;
    },
    lightboxHasNext() {
      if (!this.lightbox || this.lightbox.kind !== 'sb') return false;
      const sb = this._lightboxSb();
      if (!sb) return false;
      return this.lightbox.idx < (sb.candidates || []).length - 1;
    },
    lightboxHasPrevSb() {
      return this._lightboxSbIdx() > 0;
    },
    lightboxHasNextSb() {
      const i = this._lightboxSbIdx();
      return i >= 0 && i < this.currentProject.storyboards.length - 1;
    },
    lightboxPrev() {
      if (!this.lightboxHasPrev()) return;
      this.lightbox = { ...this.lightbox, idx: this.lightbox.idx - 1 };
    },
    lightboxNext() {
      if (!this.lightboxHasNext()) return;
      this.lightbox = { ...this.lightbox, idx: this.lightbox.idx + 1 };
    },
    lightboxPrevSb() {
      const i = this._lightboxSbIdx();
      if (i <= 0) return;
      const prevSb = this.currentProject.storyboards[i - 1];
      if (!prevSb || !(prevSb.candidates || []).length) return;
      this.lightbox = { kind: 'sb', sbId: prevSb.id, idx: 0 };
    },
    lightboxNextSb() {
      const i = this._lightboxSbIdx();
      if (i < 0 || i >= this.currentProject.storyboards.length - 1) return;
      const nextSb = this.currentProject.storyboards[i + 1];
      if (!nextSb || !(nextSb.candidates || []).length) return;
      this.lightbox = { kind: 'sb', sbId: nextSb.id, idx: 0 };
    },

    // ---- 主角色快速锁定 ----
    async setAsMainSubject(cid) {
      // toggle：如果当前已锁定该角色就解锁，否则把该角色设为主角
      const willLock = this.useSubjectFor !== cid;
      this.useSubjectFor = willLock ? cid : null;
      if (!this.currentProject) return;
      // 把所有“还没生成视频”的分镜 use_subject_reference 同步过去
      for (const sb of (this.currentProject.storyboards || [])) {
        if (sb.video_file) continue;  // 已成片的分镜不动
        const newVal = willLock ? cid : false;
        if (sb.use_subject_reference !== newVal) {
          sb.use_subject_reference = newVal;
          await this.updateStoryboard(sb);
        }
      }
    },

    // ---- 分镜 ----
    async aiGenerateStoryboards() {
      if (!this.currentProject?.script?.trim()) {
        this.aiError = '请先在 Step 1 填写剧本';
        return;
      }
      if (!this.selectedStyleCode) {
        this.aiError = '请先在上方选择画面风格';
        return;
      }
      const ok = await modals.confirm('AI 将读剧本 + 角色列表 + 所选风格，按剧情顺序拆分多个分镜并追加到列表。继续？', {title: '请确认', danger: false}); if (!ok) return;
      this.generatingStoryboards = true;
      try {
        const style = this.getStyleByCode(this.selectedStyleCode);
        const r = await fetch(`/api/projects/${this.currentProject.id}/storyboards/ai-generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            script: this.currentProject.script,
            style_hint: style ? style.desc : '',
            style_code: this.selectedStyleCode,
            target_count: 0,
          }),
        });
        if (!r.ok) {
          const d = await r.json().catch(() => ({}));
          throw new Error(d.detail || `HTTP ${r.status}`);
        }
        const d = await r.json();
        if (d.storyboards && Array.isArray(d.storyboards)) {
          for (const sb of d.storyboards) {
            sb.simple_prompt = (sb.prompt_data && sb.prompt_data.simple_prompt) || sb.script || '';
          }
          this.currentProject.storyboards.push(...d.storyboards);
        }
      } catch (e) {
        this.aiError = 'AI 分镜生成失败：' + e.message;
      } finally {
        this.generatingStoryboards = false;
      }
    },

    async addStoryboard() {
      if (!this.newSb.name) return;
      const r = await fetch(`/api/projects/${this.currentProject.id}/storyboards`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: this.newSb.name,
          script: this.newSb.script,
          prompt_data: { simple_prompt: this.newSb.script || '' },
        }),
      });
      const r2 = await fetch(`/api/projects/${this.currentProject.id}`);
      this.currentProject = await r2.json();
      // 同步 simple_prompt 到顶层
      for (const sb of (this.currentProject.storyboards || [])) {
        sb.simple_prompt = (sb.prompt_data && sb.prompt_data.simple_prompt) || sb.script || '';
      }
      this.newSb = { name: '', script: '' };
      this.showAddSb = false;
    },

    // Hailuo 2.3 平台只支持 6s / 10s 两个档位。这里做"用户友好"映射：
    // 任何 ≤6s 的输入都按 6s 算（不算浪费，因为已经是最低档），
    // 任何 >6s 的输入按 10s 算。输入范围限 0.5~10s。
    clampStoryboardDuration(sb) {
      let d = Number(sb.duration);
      if (!Number.isFinite(d) || d <= 0) d = 6;
      if (d <= 6) sb.duration = 6;
      else sb.duration = 10;
      this.updateStoryboard(sb);
    },

    async updateStoryboard(sb) {
      // 把 simple_prompt 同步到 prompt_data
      sb.prompt_data = { ...(sb.prompt_data || {}), simple_prompt: sb.simple_prompt || '' };
      await fetch(`/api/projects/${this.currentProject.id}/storyboards/${sb.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: sb.name,
          script: sb.script,
          duration: sb.duration,
          resolution: sb.resolution,
          use_subject_reference: sb.use_subject_reference,
          prompt_data: sb.prompt_data,
        }),
      });
    },

    async deleteStoryboard(sid) {
      const ok = await modals.confirm('删除此分镜？', {title: '删除确认', danger: true}); if (!ok) return;
      await fetch(`/api/projects/${this.currentProject.id}/storyboards/${sid}`, { method: 'DELETE' });
      await this.refreshProject();
    },

    async moveStoryboard(idx, dir) {
      const arr = this.currentProject.storyboards;
      const newIdx = idx + dir;
      if (newIdx < 0 || newIdx >= arr.length) return;
      [arr[idx], arr[newIdx]] = [arr[newIdx], arr[idx]];
      // 更新 order
      const order = arr.map((s, i) => ({ id: s.id, order: i }));
      await fetch(`/api/projects/${this.currentProject.id}/storyboards/reorder`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(order),
      });
    },

    async refreshProject() {
      const r = await fetch(`/api/projects/${this.currentProject.id}`);
      this.currentProject = await r.json();
      // 同步 simple_prompt 到顶层（服务端只存 prompt_data.simple_prompt，UI 绑顶层）
      for (const sb of (this.currentProject.storyboards || [])) {
        sb.simple_prompt = (sb.prompt_data && sb.prompt_data.simple_prompt) || sb.script || '';
      }
      if (!this.currentProject.grid_bundles) this.currentProject.grid_bundles = [];
    },

    async generateCandidates(sb) {
      this.generatingSb = sb.id;
      try {
        // 把 simple_prompt 也存到 prompt_data
        sb.prompt_data = { ...(sb.prompt_data || {}), simple_prompt: sb.simple_prompt };
        await this.updateStoryboard(sb);
        const r = await fetch(`/api/projects/${this.currentProject.id}/storyboards/${sb.id}/candidates`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            n: 3,
            use_subject_reference: sb.use_subject_reference || null,
          }),
        });
        if (!r.ok) {
          const d = await r.json().catch(() => ({}));
          throw new Error(d.detail || `HTTP ${r.status}`);
        }
        await this.refreshProject();
      } catch (e) {
        await modals.alert('生成失败：' + e.message, {title: '出错了', danger: true});
      } finally {
        this.generatingSb = null;
      }
    },

    async selectCandidate(sb, idx) {
      const r = await fetch(`/api/projects/${this.currentProject.id}/storyboards/${sb.id}/select`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ candidate_index: idx }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        await modals.alert('选择失败：' + (d.detail || `HTTP ${r.status}`), {title: '出错了', danger: true});
        return;
      }
      await this.refreshProject();
    },

    // ---- 渲染 ----
    async renderStoryboard(sb) {
      this.renderingSb = sb.id;
      try {
        const r = await fetch(`/api/projects/${this.currentProject.id}/storyboards/${sb.id}/render`, { method: 'POST' });
        const data = await r.json();
        sb.video_task_id = data.task_id;
        sb.video_status = 'Preparing';
        // 自动开始轮询
        this.pollStoryboardVideo(sb);
      } catch (e) {
        await modals.alert('渲染失败：' + e.message, {title: '出错了', danger: true});
      } finally {
        this.renderingSb = null;
      }
    },

    async pollStoryboardVideo(sb) {
      // 先清理之前可能残留的轮询，避免每次点击 render 都累积一个 setInterval
      if (sb._pollId) {
        clearInterval(sb._pollId);
        sb._pollId = null;
      }
      sb._pollId = setInterval(async () => {
        try {
          const r = await fetch(`/api/projects/${this.currentProject.id}/storyboards/${sb.id}/video`);
          if (!r.ok) {
            // 端点报错（如 4xx）停止轮询，避免空转
            clearInterval(sb._pollId);
            sb._pollId = null;
            return;
          }
          const data = await r.json();
          sb.video_status = data.video_status;
          sb.video_file = data.video_file;
          sb.video_task_id = data.video_task_id;
          if (data.video_status === 'Success' || data.video_status === 'Fail') {
            clearInterval(sb._pollId);
            sb._pollId = null;
            // 刷新整个项目状态
            await this.refreshProject();
          }
        } catch (e) {
          console.error(e);
        }
      }, 8000);
    },

    // ---- 拼接 ----
    get canRenderAll() {
      return this.currentProject?.storyboards?.length > 0 &&
        this.currentProject.storyboards.every(s => s.video_file);
    },

    async renderAll() {
      this.rendering = true;
      try {
        const r = await fetch(`/api/projects/${this.currentProject.id}/render-all?transition=${this.renderOpts.transition}&transition_duration=${this.renderOpts.transition_duration}`, {
          method: 'POST',
        });
        const data = await r.json();
        if (data.output) {
          this.currentProject.output_video = data.output;
          await modals.alert('成片已生成！', {title: '成功', danger: false});
        } else {
          await modals.alert('拼接失败：' + (data.detail || '未知错误'), {title: '出错了', danger: true});
        }
      } catch (e) {
        await modals.alert('拼接失败：' + e.message, {title: '出错了', danger: true});
      } finally {
        this.rendering = false;
      }
    },

    // ---- 九宫格合并（1 次 API 调用出片） ----
    get selectedStoryboardCount() {
      return (this.currentProject?.storyboards || []).filter(s => s.selected).length;
    },

    async composeGrid() {
      const count = this.selectedStoryboardCount;
      if (count < 1) { await modals.alert('请先为分镜选定候选图', {title: '提示', danger: false}); return; }
      if (count > 9) {
        const ok = await modals.confirm(`当前有 ${count} 个分镜已选图，只会用前 9 个填入九宫格。继续？`, {title: '请确认', danger: false});
        if (!ok) return;
      }
      this.composingGrid = true;
      try {
        const r = await fetch(`/api/projects/${this.currentProject.id}/grid-bundle`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            duration: this.gridBundle.duration,
            resolution: this.gridBundle.resolution,
          }),
        });
        const data = await r.json();
        if (!r.ok) throw new Error(data.detail || 'HTTP ' + r.status);
        await this.refreshProject();
        // 自动开始轮询新生成的网格包
        if (data.bundle && data.bundle.id) {
          const newBundle = this.currentProject.grid_bundles.find(b => b.id === data.bundle.id);
          if (newBundle) this.pollGridBundleVideo(newBundle);
        }
      } catch (e) {
        await modals.alert('九宫格合并失败：' + e.message, {title: '出错了', danger: true});
      } finally {
        this.composingGrid = false;
      }
    },

    async pollGridBundleVideo(bundle) {
      if (bundle._pollId) {
        clearInterval(bundle._pollId);
        bundle._pollId = null;
      }
      bundle._pollId = setInterval(async () => {
        try {
          const r = await fetch(`/api/projects/${this.currentProject.id}/grid-bundles/${bundle.id}/video`);
          if (!r.ok) {
            clearInterval(bundle._pollId);
            bundle._pollId = null;
            return;
          }
          const data = await r.json();
          bundle.video_status = data.video_status;
          bundle.video_file = data.video_file;
          if (data.video_status === 'Success' || data.video_status === 'Fail') {
            clearInterval(bundle._pollId);
            bundle._pollId = null;
          }
        } catch (e) {
          console.error(e);
        }
      }, 8000);
    },

    formatDate(iso) {
      if (!iso) return '';
      const d = new Date(iso);
      return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
    },

    // ---- 头脑风暴 ----
    openBrainstorm() {
      // 预填当前 script 作为 brief（如果有的话）
      if (this.currentProject && this.currentProject.script && !this.brainstormBrief) {
        // 取前 100 字作为 brief
        this.brainstormBrief = this.currentProject.script.substring(0, 200);
      }
      this.showBrainstorm = true;
      this.brainstormIdeas = [];
      this.brainstormError = '';
    },

    closeBrainstorm() {
      this.showBrainstorm = false;
    },

    async runBrainstorm() {
      if (!this.brainstormBrief.trim()) return;
      this.brainstormLoading = true;
      this.brainstormError = '';
      this.brainstormIdeas = [];
      try {
        const r = await fetch('/api/brainstorm', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            brief: this.brainstormBrief.trim(),
            count: this.brainstormCount,
            style_hint: this.brainstormStyleHint.trim(),
            aspect_ratio: this.currentProject?.aspect_ratio || '16:9',
          }),
        });
        const d = await r.json();
        if (!d.ok) {
          this.brainstormError = d.error || '生成失败';
          return;
        }
        this.brainstormIdeas = d.ideas || [];
        if (this.brainstormIdeas.length === 0) {
          this.brainstormError = 'AI 没生成出有效方案，请换个 brief 重试';
        }
      } catch (e) {
        this.brainstormError = '请求失败：' + e.message;
      } finally {
        this.brainstormLoading = false;
      }
    },

    async applyBrainstormIdea(idea) {
      // 把选中的方向填到 project.script
      const parts = [];
      if (idea.title) parts.push(`【${idea.title}】`);
      if (idea.logline) parts.push(idea.logline);
      if (idea.full_script) parts.push(idea.full_script);
      this.currentProject.script = parts.join('\n\n');
      await this.saveProject();  // 等 PUT 落地，避免刷新页面看不到
      this.closeBrainstorm();
    },

    async copyIdea(idea) {
      const text = `【${idea.title}】\n${idea.logline}\n\n${idea.full_script}`;
      try {
        await navigator.clipboard.writeText(text);
        idea._copied = true;
        setTimeout(() => { idea._copied = false; }, 1500);
      } catch (e) {}
    },
  }));
});
