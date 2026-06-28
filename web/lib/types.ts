export interface Character {
  id: string;
  name: string;
  description: string;
  reference_image: string;
  generated_images: string[];
  selected: string;
}
export interface Storyboard {
  id: string;
  order: number;
  name: string;
  script: string;
  prompt_data: Record<string, any>;
  use_subject_reference: string;
  duration: number;
  resolution: string;
  candidates: string[];
  selected: string;
  video_task_id: string;
  video_status: string;
  video_file: string;
}
export interface Project {
  id: string;
  name: string;
  script: string;
  aspect_ratio: string;
  characters: Character[];
  storyboards: Storyboard[];
  grid_bundles?: any[];
  created_at?: string;
  updated_at?: string;
}
