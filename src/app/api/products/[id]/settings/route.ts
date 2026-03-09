import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/auth";
import { updateProductSettings } from "@/lib/db";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getUserFromRequest(req);
    const data = await req.json();
    const updated = await updateProductSettings(params.id, data);
    return NextResponse.json(updated);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
```

Once that's saved, let's do a quick check to make sure all files are there. Run this in the terminal:
```
Get-ChildItem -Recurse -Filter "route.ts" src/app/api | Select-Object FullName