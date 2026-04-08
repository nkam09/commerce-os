import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

export default async function LandingPage() {
  const { userId } = await auth();

  if (userId) {
    redirect("/overview");
  }

  return (
    <main className="min-h-screen bg-gray-950 flex flex-col items-center justify-center px-4">
      <div className="max-w-md w-full text-center space-y-8">
        {/* Logo / wordmark */}
        <div className="space-y-2">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-xl bg-blue-600 text-white text-2xl font-bold mb-4">
            C
          </div>
          <h1 className="text-3xl font-bold text-white tracking-tight">
            Commerce OS
          </h1>
          <p className="text-gray-400 text-sm">
            Internal Amazon operator platform. Centralized visibility for
            sales, inventory, cash flow, and operations.
          </p>
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-3">
          <Link
            href="/sign-in"
            className="w-full inline-flex items-center justify-center rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium px-6 py-3 transition-colors"
          >
            Sign In
          </Link>
          <Link
            href="/overview"
            className="w-full inline-flex items-center justify-center rounded-lg border border-gray-700 hover:border-gray-500 text-gray-300 hover:text-white font-medium px-6 py-3 transition-colors"
          >
            Open App
          </Link>
        </div>

        {/* Footer note */}
        <p className="text-xs text-gray-600">
          Private internal tool. Authorized users only.
        </p>
      </div>
    </main>
  );
}
