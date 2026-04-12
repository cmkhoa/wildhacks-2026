'use client';

export default function LoginPage() {
  return (
    <main className="flex min-h-screen w-full items-center justify-center overflow-hidden bg-[#FDFCFB] p-6 font-sans text-[#424242] selection:bg-teal-200">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,#DDF4EE_0%,rgba(221,244,238,0.46)_30%,rgba(253,252,251,0)_62%)]" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-[linear-gradient(180deg,rgba(253,252,251,0)_0%,rgba(237,246,243,0.72)_100%)]" />

      <section className="login-card-float relative grid w-full max-w-[1040px] grid-cols-1 items-center overflow-hidden rounded-[44px] border border-white/80 bg-white/92 p-7 text-center shadow-[0_28px_90px_rgba(35,74,67,0.14)] backdrop-blur md:min-h-[590px] md:grid-cols-[1.08fr_0.92fr] md:gap-12 md:p-11 md:text-left lg:p-14">
        <div className="login-card-shine pointer-events-none absolute inset-0" />
        <div className="absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-[#BEE8DD] to-transparent" />
        <div className="absolute -left-16 -top-16 h-56 w-72 rounded-full bg-[#DDF4EE]/65 blur-3xl" />
        <div className="absolute -bottom-24 right-6 h-52 w-72 rounded-full bg-[#FDF3DE]/70 blur-3xl" />

        <div className="relative mb-9 flex min-h-[310px] items-center justify-center overflow-hidden rounded-[36px] border border-[#DDEBE7] bg-[#F4FBF8] shadow-[inset_0_1px_22px_rgba(255,255,255,0.86),0_18px_46px_rgba(47,143,131,0.08)] md:mb-0 md:min-h-[480px]">
          <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.8)_0%,rgba(255,255,255,0)_48%,rgba(221,244,238,0.68)_100%)]" />
          <div className="absolute left-8 top-8 rounded-2xl border border-white/90 bg-white/72 px-4 py-3 text-left shadow-[0_12px_26px_rgba(35,74,67,0.08)] backdrop-blur">
            <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-[#9DA9A6]">
              Next block
            </p>
            <p className="mt-1 text-sm font-extrabold text-[#243B37]">Start small</p>
          </div>
          <div className="absolute h-60 w-60 rounded-full border border-[#BEE8DD] bg-white/58 shadow-[0_24px_70px_rgba(47,143,131,0.14)]" />
          <div className="login-orbit absolute h-80 w-80 rounded-full border border-dashed border-[#BEE8DD]" />
          <div className="login-floating-gem absolute left-14 top-28 h-5 w-5 rotate-45 rounded bg-[#E6B95C]/80" />
          <div className="login-floating-gem-slow absolute bottom-24 right-28 h-4 w-4 rotate-45 rounded bg-[#2F8F83]/65" />
          <div className="login-floating-dot absolute bottom-28 left-20 h-3 w-3 rounded-full bg-[#82B7DD]/75" />

          <div className="relative flex h-36 w-36 items-center justify-center rounded-[38px] border border-[#F3E2B8] bg-[#FDF3DE] shadow-[inset_0_1px_10px_rgba(255,255,255,0.86),0_24px_52px_rgba(230,185,92,0.26)]">
            <div className="h-16 w-16 rotate-45 rounded-[12px] bg-[#E6B95C] shadow-[0_12px_26px_rgba(230,185,92,0.38)]" />
            <div className="absolute left-10 top-10 h-3 w-3 rounded-full bg-white/80" />
          </div>
        </div>

        <div className="relative flex flex-col items-center md:items-start md:pr-4">
          <p className="mb-3 rounded-full border border-[#D7EFE8] bg-[#F4FBF8] px-4 py-2 text-[11px] font-extrabold uppercase tracking-[0.18em] text-[#2F8F83]">
            ADHD-friendly planning
          </p>

          <h1 className="mb-5 text-[48px] font-extrabold leading-[1.02] tracking-tight text-[#243B37] md:text-[68px]">
            UnStuck
          </h1>

          <p className="mb-10 max-w-[360px] text-[18px] font-semibold leading-8 text-[#6F7D7A]">
            When starting feels hard, we make it easier.
          </p>

          <a
            href={`${process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8080'}/auth/login`}
            className="group relative flex w-full items-center justify-center rounded-2xl border border-[#DCE8E4] bg-[#243B37] px-5 py-5 text-[16px] font-extrabold text-white shadow-[0_16px_34px_rgba(36,59,55,0.2)] outline-none transition-all duration-200 hover:-translate-y-0.5 hover:bg-[#2F8F83] hover:shadow-[0_20px_40px_rgba(47,143,131,0.24)] focus-visible:ring-4 focus-visible:ring-[#BEE8DD] active:translate-y-0 active:scale-[0.98] md:max-w-[380px]"
          >
            <span className="mr-3 flex h-9 w-9 items-center justify-center rounded-xl bg-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.7)]">
              <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 15.02 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
              </svg>
            </span>
            Continue with Google
          </a>

          <p className="mt-8 max-w-[280px] text-[11px] font-extrabold uppercase leading-relaxed tracking-[0.16em] text-[#9DA9A6]">
            Syncs with Google Calendar to automate your flow
          </p>
        </div>
      </section>
    </main>
  );
}
