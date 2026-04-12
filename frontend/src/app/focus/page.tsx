import { FocusPage } from '@/components/FocusPage';

type FocusSearchParams = Promise<{
  title?: string;
  reward?: string;
  minutes?: string;
  id?: string;
  steps?: string;
  subtasks?: string;
  docLinks?: string;
  draftLinks?: string;
}>;

export default async function Page({
  searchParams,
}: {
  searchParams: FocusSearchParams;
}) {
  const params = await searchParams;
  const reward = Number(params.reward ?? 10);
  const minutes = Number(params.minutes ?? 25);
  
  let steps: string[] = [];
  try {
    if (params.steps) steps = JSON.parse(params.steps);
  } catch(e) {}

  // Parse structured subtasks (with IDs) if available
  let subtasks: { id?: string; title: string; steps?: string[]; estimated_minutes?: number; completed?: boolean }[] = [];
  try {
    if (params.subtasks) subtasks = JSON.parse(params.subtasks);
  } catch(e) {}

  // Parse doc links
  let docLinks: string[] = [];
  try {
    if (params.docLinks) docLinks = JSON.parse(params.docLinks);
  } catch(e) {}

  // Parse draft links
  let draftLinks: string[] = [];
  try {
    if (params.draftLinks) draftLinks = JSON.parse(params.draftLinks);
  } catch(e) {}

  return (
    <FocusPage
      initialTask={{
        id: params.id,
        title: params.title ?? 'Outline history essay',
        reward_value: Number.isFinite(reward) ? reward : 10,
        block_minutes: Number.isFinite(minutes) ? minutes : 25,
        steps: steps,
      }}
      subtaskData={subtasks}
      docLinks={docLinks}
      draftLinks={draftLinks}
    />
  );
}
