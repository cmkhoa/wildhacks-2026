import { FocusPage } from '@/components/FocusPage';

type FocusSearchParams = Promise<{
  title?: string;
  reward?: string;
  minutes?: string;
  id?: string;
  steps?: string;
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

  return (
    <FocusPage
      initialTask={{
        id: params.id,
        title: params.title ?? 'Outline history essay',
        reward_value: Number.isFinite(reward) ? reward : 10,
        block_minutes: Number.isFinite(minutes) ? minutes : 25,
        steps: steps,
      }}
    />
  );
}
