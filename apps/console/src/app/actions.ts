'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { isHandle } from '@courier/core';
import { SESSION_COOKIE, checkToken, requireOperator } from '@/lib/auth';
import { runtime } from '@/lib/runtime';

function handleFrom(form: FormData): string {
  const h = String(form.get('handle') ?? '');
  if (!isHandle(h, 'ord')) throw new Error('invalid order handle');
  return h;
}

export async function approveOrder(form: FormData): Promise<void> {
  const operator = await requireOperator();
  const rt = await runtime();
  await rt.operator.approve(handleFrom(form), operator);
  revalidatePath('/');
}

export async function rejectOrder(form: FormData): Promise<void> {
  const operator = await requireOperator();
  const rt = await runtime();
  rt.operator.reject(handleFrom(form), operator);
  revalidatePath('/');
}

export async function refreshOrder(form: FormData): Promise<void> {
  await requireOperator();
  const rt = await runtime();
  await rt.operator.advance(handleFrom(form));
  revalidatePath('/');
}

export async function login(form: FormData): Promise<void> {
  const token = String(form.get('token') ?? '');
  if (!checkToken(token)) redirect('/login?error=invalid');
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 12,
  });
  redirect('/');
}

export async function logout(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
  redirect('/login');
}
