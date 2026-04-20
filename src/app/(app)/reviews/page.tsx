"use client";

import { AppTopbar } from "@/components/app/app-topbar";
import { ReviewsPage } from "@/components/pages/reviews/reviews-page";

export default function Page() {
  return (
    <>
      <AppTopbar title="Reviews" />
      <main className="flex-1 overflow-y-auto">
        <ReviewsPage />
      </main>
    </>
  );
}
