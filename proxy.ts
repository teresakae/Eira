// Asks for the staff password before /staff loads.
import { NextResponse, type NextRequest } from 'next/server';
import { isStaff } from '@/lib/staff';

export function proxy(req: NextRequest) {
  if (isStaff(req.headers.get('authorization'))) return NextResponse.next();
  return new NextResponse('Staff only', { status: 401, headers: { 'WWW-Authenticate': 'Basic realm="SAPA 129 staff"' } });
}

export const config = { matcher: '/staff' };
