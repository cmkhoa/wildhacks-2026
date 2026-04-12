import { FocusPage } from '@/components/FocusPage';

type FocusSearchParams = Promise<{
  title?: string;
  reward?: string;
  minutes?: string;
}>;

export default async function Page({
  searchParams,
}: {
  searchParams: FocusSearchParams;
}) {
  const params = await searchParams;
  const reward = Number(params.reward ?? 10);
  const minutes = Number(params.minutes ?? 25);

  return (
    <FocusPage
      initialTask={{
        title: params.title ?? 'Outline history essay',
        reward_value: Number.isFinite(reward) ? reward : 10,
        block_minutes: Number.isFinite(minutes) ? minutes : 25,
      }}
    />
  );
}
