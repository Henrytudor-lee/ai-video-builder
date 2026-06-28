// 视频提示词工坊 - 前端逻辑
// 基于 Alpine.js 3.x

function appData() {
  return {
    // ============ 状态 ============
    options: {
      subjects: {},
      actions: [],
      scenes: {},
      cameras: {},
      styles: {},
      motions: [],
      atmospheres: [],
      presets: [],
    },
    config: { has_key: false, key_preview: '' },
    showKeyModal: false,
    newKey: '',
    history: [],
    currentPrompt: '',
    promptLength: 0,
    copyBtnText: '📋 复制',
    generating: false,
    generateStatus: '生成中...',
    generateError: '',
    currentResult: null,
    pollTimer: null,

    // ============ 表单状态 ============
    subject: { category: '人物', type: 'child_boy', number: 1, description: '' },
    scene: { location: '', time: '', weather: '', light_dir: '', details: '' },
    action: { timeline: [
      { time: '0-2s', action: '' },
      { time: '3-4s', action: '' },
      { time: '5-6s', action: '' },
    ], expression: '' },
    camera: { shot: '', movement: '', angle: '', focal: '', depth: '' },
    style: { anchors: [], tone: '', saturation: '', lighting: '', moods: [] },
    motion: [],
    extra: '',
    duration: 6,
    resolution: '768P',

    // ============ 初始化 ============
    async init() {
      await this.loadOptions();
      await this.loadConfig();
      await this.loadHistory();
      // 每次表单变化自动重算 prompt
      this.$watch('subject', () => this.rebuildPrompt(), { deep: true });
      this.$watch('scene', () => this.rebuildPrompt(), { deep: true });
      this.$watch('action', () => this.rebuildPrompt(), { deep: true });
      this.$watch('camera', () => this.rebuildPrompt(), { deep: true });
      this.$watch('style', () => this.rebuildPrompt(), { deep: true });
      this.$watch('motion', () => this.rebuildPrompt(), { deep: true });
      this.$watch('extra', () => this.rebuildPrompt());
    },

    async loadOptions() {
      const r = await fetch('/api/options');
      this.options = await r.json();
    },

    async loadConfig() {
      const r = await fetch('/api/config');
      this.config = await r.json();
    },

    async loadHistory() {
      const r = await fetch('/api/history');
      this.history = await r.json();
    },

    // ============ Prompt 拼装（前端版，与后端 assemble_prompt 保持一致） ============
    SUBJECT_TRANSLATIONS: {
      child_boy: 'a young boy', child_girl: 'a young girl', teen_boy: 'a teenage boy',
      teen_girl: 'a teenage girl', man: 'a man', woman: 'a woman', elder_man: 'an elderly man',
      elder_woman: 'an elderly woman', baby: 'a baby',
      cat: 'a cat', dog: 'a dog', rabbit: 'a rabbit', bird: 'a bird', fox: 'a fox',
      deer: 'a deer', horse: 'a horse', tiger: 'a tiger', wolf: 'a wolf', panda: 'a panda',
      dragon: 'a dragon', phoenix: 'a phoenix',
      car: 'a car', building: 'a building', flower: 'a flower', book: 'a book', cup: 'a cup',
      sword: 'a sword', lantern: 'a lantern', tree: 'a tree', moon: 'the moon', star: 'a star',
    },

    pluralize(base, n) {
      if (n === 1) return base;
      if (base.endsWith('y')) return base.slice(0, -1) + 'ies';
      if (/(s|x|ch|sh)$/.test(base)) return base + 'es';
      return base + 's';
    },

    rebuildPrompt() {
      const sections = [];

      // 1. 主体
      if (this.subject.type) {
        const base = this.SUBJECT_TRANSLATIONS[this.subject.type] || '';
        if (base) {
          const n = this.subject.number || 1;
          let subj = this.pluralize(base, n);
          if (n > 1) subj += ` (${n} of them)`;
          if (this.subject.description) {
            const desc = this.subject.description.trim();
            if (/^(with|wearing|holding|in|at)/.test(desc)) {
              subj += `, ${desc}`;
            } else {
              subj += `, with ${desc}`;
            }
          }
          sections.push(subj);
        }
      }

      // 2. 场景
      const sceneParts = [];
      if (this.scene.time && this.scene.location) {
        sceneParts.push(`${this.scene.time} ${this.scene.location}`);
      } else if (this.scene.time) {
        sceneParts.push(this.scene.time);
      } else if (this.scene.location) {
        sceneParts.push(this.scene.location);
      }
      if (this.scene.details) sceneParts.push(this.scene.details);
      if (this.scene.weather) sceneParts.push(this.scene.weather);
      if (this.scene.light_dir) sceneParts.push(this.scene.light_dir);
      if (sceneParts.length) sections.push(`in ${sceneParts.join(', ')}`);

      // 3. 动作
      const acts = this.action.timeline
        .filter(t => t.action && t.action.trim())
        .sort((a, b) => (a.time || '').localeCompare(b.time || ''))
        .map(t => t.action.trim());
      if (acts.length) {
        let actionStr = acts[0];
        for (let i = 1; i < acts.length; i++) {
          actionStr += (i === acts.length - 1) ? `, then ${acts[i]}` : `, ${acts[i]}`;
        }
        if (this.action.expression) {
          // dedup：末尾已包含 expression 就不再加
          const tail = actionStr.slice(-80).toLowerCase();
          if (!tail.includes('expression') && !tail.includes('facial') && !tail.includes('微笑') && !tail.includes('表情')) {
            actionStr += `, ${this.action.expression} expression`;
          }
        }
        sections.push(actionStr);
      }

      // 4. 镜头
      const camParts = [];
      if (this.camera.shot) camParts.push(this.camera.shot);
      if (this.camera.movement && this.camera.movement !== 'fixed') camParts.push(this.camera.movement);
      if (this.camera.angle) camParts.push(this.camera.angle);
      if (this.camera.focal) camParts.push(this.camera.focal);
      if (this.camera.depth) camParts.push(this.camera.depth);
      if (camParts.length) sections.push(camParts.join(', '));

      // 5. 风格
      const styleParts = [];
      styleParts.push(...this.style.anchors);
      if (this.style.tone) styleParts.push(this.style.tone);
      if (this.style.saturation) styleParts.push(this.style.saturation);
      if (this.style.lighting) styleParts.push(this.style.lighting);
      if (this.style.moods.length) styleParts.push(this.style.moods.join(', '));
      if (styleParts.length) sections.push(`${styleParts.join(', ')} style`);

      // 6. 运镜指令
      if (this.motion.length) {
        const groups = {};
        for (const m of this.motion) {
          const g = m.group || 0;
          (groups[g] = groups[g] || []).push(m.code);
        }
        const groupKeys = Object.keys(groups).sort();
        if (groupKeys.length === 1) {
          sections.push(`[${groups[groupKeys[0]].join(', ')}]`);
        } else {
          sections.push(groupKeys.map(g => `[${groups[g].join(', ')}]`).join(', then '));
        }
      }

      // 7. 补充
      if (this.extra && this.extra.trim()) {
        sections.push(this.extra.trim());
      }

      const prompt = sections.join(', ');
      this.currentPrompt = prompt;
      this.promptLength = prompt.length;
    },

    // ============ 交互操作 ============
    addActionToCurrent(desc) {
      // 找第一个空的 action 填入
      for (const seg of this.action.timeline) {
        if (!seg.action || !seg.action.trim()) {
          seg.action = desc;
          return;
        }
      }
      // 都填了就加新时段
      this.action.timeline.push({ time: '', action: desc });
    },

    setCamera(field, code, desc) {
      // 镜头：每个 group 单选
      this.camera[field] = (this.camera[field] === desc) ? '' : desc;
    },

    getCameraActive(field, code) {
      // 通过 label 反查 desc 找匹配
      const items = (this.options.cameras && this.options.cameras[field]) || [];
      const item = items.find(i => i.code === code);
      return item && this.camera[field] === item.desc;
    },

    toggleStyleAnchor(desc) {
      const idx = this.style.anchors.indexOf(desc);
      if (idx >= 0) this.style.anchors.splice(idx, 1);
      else this.style.anchors.push(desc);
    },

    getStyleOptions() {
      // styles.json 里 "艺术风格" 是嵌套的，其他是平的
      const s = this.options.styles || {};
      const out = {};
      for (const k of Object.keys(s)) {
        if (k === '艺术风格') continue;
        out[k] = s[k];
      }
      return out;
    },

    getStyleSelect(groupName) {
      return this.style[styleKeyMap(groupName)] || '';
    },

    setStyleField(groupName, value) {
      this.style[styleKeyMap(groupName)] = value;
    },

    toggleMood(code) {
      const idx = this.style.moods.indexOf(code);
      if (idx >= 0) this.style.moods.splice(idx, 1);
      else this.style.moods.push(code);
    },

    toggleMotion(m) {
      const idx = this.motion.findIndex(x => x.code === m.code);
      if (idx >= 0) {
        this.motion.splice(idx, 1);
      } else {
        this.motion.push({ code: m.code, group: 0 });
      }
    },

    hasMotion(code) {
      return this.motion.some(m => m.code === code);
    },

    // ============ 预设加载 ============
    loadPreset(p) {
      // 深拷贝避免引用
      this.subject = JSON.parse(JSON.stringify(p.subject || this.subject));
      this.scene = JSON.parse(JSON.stringify(p.scene || this.scene));
      this.action = JSON.parse(JSON.stringify(p.action || this.action));
      this.camera = JSON.parse(JSON.stringify(p.camera || this.camera));
      this.style = JSON.parse(JSON.stringify(p.style || this.style));
      this.motion = JSON.parse(JSON.stringify(p.motion || []));
      this.extra = p.extra || '';
      this.duration = p.duration || 6;
      this.resolution = p.resolution || '768P';

      // subject.category 也要推断
      for (const cat of Object.keys(this.options.subjects || {})) {
        const found = (this.options.subjects[cat] || []).find(s => s.code === this.subject.type);
        if (found) this.subject.category = cat;
      }

      // 滚动到顶部
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },

    // ============ 生成 ============
    async generate() {
      if (this.generating) return;
      if (!this.currentPrompt) {
        this.generateError = 'Prompt 为空，请至少填写一个字段';
        return;
      }
      if (this.promptLength > 2000) {
        this.generateError = `Prompt 过长（${this.promptLength}/2000）`;
        return;
      }

      this.generating = true;
      this.generateError = '';
      this.currentResult = null;

      // 找当前预设名（粗略）
      const presetName = '';

      try {
        const r = await fetch('/api/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            subject: this.subject,
            scene: this.scene,
            action: this.action,
            camera: this.camera,
            style: this.style,
            motion: this.motion,
            extra: this.extra,
            duration: this.duration,
            resolution: this.resolution,
            preset_name: presetName,
          }),
        });

        if (!r.ok) {
          const err = await r.json();
          throw new Error(err.detail || '生成失败');
        }

        const { task_id } = await r.json();
        this.generateStatus = '排队中...';
        this.currentResult = { task_id, status: 'Preparing' };

        // 服务端主动轮询
        const waitR = await fetch(`/api/status/${task_id}/wait`, { method: 'POST' });
        if (!waitR.ok) {
          const err = await waitR.json();
          throw new Error(err.detail || '轮询失败');
        }

        this.currentResult = await waitR.json();
        this.generateStatus = '完成 ✓';

        // 刷新历史
        await this.loadHistory();

      } catch (e) {
        this.generateError = e.message;
        this.currentResult = { status: 'Fail', error: e.message };
        this.generateStatus = '失败';
      } finally {
        this.generating = false;
      }
    },

    // ============ API key ============
    async saveKey() {
      if (!this.newKey.trim()) return;
      const r = await fetch('/api/config/key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key: this.newKey.trim() }),
      });
      if (r.ok) {
        this.showKeyModal = false;
        this.newKey = '';
        await this.loadConfig();
      }
    },

    // ============ 历史 ============
    async deleteHistory(id) {
      const ok = await modals.confirm('确认删除这条记录？', {title: '删除确认', danger: true});
      if (!ok) return;
      await fetch(`/api/history/${id}`, { method: 'DELETE' });
      await this.loadHistory();
    },

    // ============ 复制 ============
    async copyPrompt() {
      if (!this.currentPrompt) return;
      try {
        await navigator.clipboard.writeText(this.currentPrompt);
        this.copyBtnText = '✓ 已复制';
        setTimeout(() => { this.copyBtnText = '📋 复制'; }, 1500);
      } catch (e) {
        this.copyBtnText = '复制失败';
      }
    },
  };
}

// 把 "色调/饱和度/光线质感" 等中文 group 名映射到 style 对象的字段
function styleKeyMap(groupName) {
  const map = {
    '色调': 'tone',
    '饱和度': 'saturation',
    '光线质感': 'lighting',
  };
  return map[groupName] || groupName;
}
