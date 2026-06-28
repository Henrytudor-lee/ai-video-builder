-- ============================================================
-- AI Video Builder · Supabase Schema
-- 完整功能迁移的 PostgreSQL DDL
-- 在 Supabase 项目 → SQL Editor → 粘贴 → Run
-- ============================================================

-- 启用需要的扩展
create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- ============================================================
-- 1. projects · 项目主表
-- ============================================================
create table public.projects (
  id          text        primary key,                              -- 8 字符 hex（保留原约定）
  name        text        not null,
  script      text        not null default '',
  aspect_ratio text       not null default '16:9'
                          check (aspect_ratio in ('16:9','9:16','1:1','4:3','3:2')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index idx_projects_updated_at on public.projects (updated_at desc);

-- ============================================================
-- 2. characters · 项目角色（含参考图、定妆照候选）
-- ============================================================
create table public.characters (
  id               text        primary key,                         -- 6 字符 hex
  project_id       text        not null references public.projects(id) on delete cascade,
  name             text        not null,
  description      text        not null default '',
  reference_image  text        not null default '',                -- Storage 路径
  generated_images jsonb       not null default '[]'::jsonb,       -- 候选定妆照路径数组
  selected         text        not null default '',                -- 用户最终选定的
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index idx_characters_project on public.characters (project_id);

-- ============================================================
-- 3. storyboards · 分镜
-- ============================================================
create table public.storyboards (
  id                    text        primary key,                     -- 6 字符 hex
  project_id            text        not null references public.projects(id) on delete cascade,
  "order"              integer     not null default 0,
  name                  text        not null default '',
  script                text        not null default '',
  prompt_data           jsonb       not null default '{}'::jsonb,    -- 6 段 prompt
  use_subject_reference text        not null default '',             -- character.id
  duration              numeric     not null default 6                -- numeric 支持 0.5~10s
                                  check (duration >= 0.5 and duration <= 10),
  resolution            text        not null default '768P'
                                  check (resolution in ('768P','1080P')),
  candidates            jsonb       not null default '[]'::jsonb,
  selected              text        not null default '',
  video_task_id         text        not null default '',
  video_status          text        not null default ''
                                  check (video_status in ('','Preparing','Success','Fail','Queueing')),
  video_file            text        not null default '',
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index idx_storyboards_project on public.storyboards (project_id, "order");

-- ============================================================
-- 4. grid_bundles · 九宫格合并包
-- ============================================================
create table public.grid_bundles (
  id              text        primary key,                           -- 6 字符 hex
  project_id      text        not null references public.projects(id) on delete cascade,
  grid_image      text        not null default '',
  duration        integer     not null default 10
                          check (duration in (6,10)),
  resolution      text        not null default '768P'
                          check (resolution in ('768P','1080P')),
  storyboard_ids  jsonb       not null default '[]'::jsonb,
  panel_count     integer     not null default 0,
  video_task_id   text        not null default '',
  video_status    text        not null default ''
                          check (video_status in ('','Preparing','Success','Fail')),
  video_file      text        not null default '',
  created_at      timestamptz not null default now()
);
create index idx_grid_bundles_project on public.grid_bundles (project_id, created_at desc);

-- ============================================================
-- 5. history · v1 Builder 生成历史
-- ============================================================
create table public.history (
  id            text        primary key,
  task_id       text        not null,
  prompt        text        not null default '',
  duration      integer     not null default 6,
  resolution    text        not null default '768P',
  video_file    text        not null default '',
  download_url  text        not null default '',
  created_at    timestamptz not null default now()
);
create index idx_history_created_at on public.history (created_at desc);

-- ============================================================
-- 6. tasks · 异步任务元数据
-- ============================================================
create table public.tasks (
  task_id     text        primary key,
  prompt      text        not null default '',
  duration    integer     not null default 6,
  resolution  text        not null default '768P',
  model       text        not null default '',
  created_at  timestamptz not null default now()
);

-- ============================================================
-- 7. user_settings · 单行配置
-- ============================================================
create table public.user_settings (
  id            integer     primary key default 1
                            check (id = 1),
  has_key       boolean     not null default false,
  key_preview   text        not null default '',
  ffmpeg_available boolean  not null default false,
  updated_at    timestamptz not null default now()
);

insert into public.user_settings (id) values (1) on conflict (id) do nothing;

-- ============================================================
-- 8. updated_at 触发器
-- ============================================================
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_projects_updated_at
  before update on public.projects
  for each row execute function public.set_updated_at();

create trigger trg_characters_updated_at
  before update on public.characters
  for each row execute function public.set_updated_at();

create trigger trg_storyboards_updated_at
  before update on public.storyboards
  for each row execute function public.set_updated_at();

-- ============================================================
-- 9. RLS 关闭（MVP 阶段）
-- ============================================================
alter table public.projects      disable row level security;
alter table public.characters    disable row level security;
alter table public.storyboards   disable row level security;
alter table public.grid_bundles  disable row level security;
alter table public.history       disable row level security;
alter table public.tasks         disable row level security;
alter table public.user_settings disable row level security;

-- ============================================================
-- 10. 视图：项目列表（带统计）
-- ============================================================
create or replace view public.v_projects_list as
select
  p.id, p.name, p.script, p.aspect_ratio,
  p.created_at, p.updated_at,
  coalesce(c.cnt, 0) as character_count,
  coalesce(s.cnt, 0) as storyboard_count
from public.projects p
left join (
  select project_id, count(*) as cnt from public.characters group by project_id
) c on c.project_id = p.id
left join (
  select project_id, count(*) as cnt from public.storyboards group by project_id
) s on s.project_id = p.id
order by p.updated_at desc;

-- ============================================================
-- 11. Storage Bucket（需在 Dashboard 手动创建）
-- ============================================================
-- 桶名: media（Public bucket）
-- 路径约定:
--   characters/{cid}_ref.jpg
--   characters/{cid}_v{i}.jpg
--   storyboards/{sid}/v{i}.jpg
--   storyboards/{sid}/video.mp4
--   grid_bundles/{bid}_grid.jpg
--   grid_bundles/{bid}_video.mp4
--   outputs/{task_id}.mp4
--
-- 完成后验证:
--   select * from public.v_projects_list;
