import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/auth";
import prisma, { getExpenses, computeMonthlyExpenseTotal } from "@/lib/db";

export async function GET(req: NextRequest) {
  try {
    const user = await getUserFromRequest(req);
    const expenses = await getExpenses(user.id);
    const monthlyTotal = computeMonthlyExpenseTotal(expenses);
    return NextResponse.json({ expenses, monthlyTotal });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getUserFromRequest(req);
    const data = await req.json();
    const expense = await prisma.expense.create({ data: { ...data, userId: user.id } });
    return NextResponse.json(expense, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
