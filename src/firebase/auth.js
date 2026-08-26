import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  updateProfile,
} from 'firebase/auth';
import { auth } from './config.js';

export async function signUp(nome, email, senha) {
  const credencial = await createUserWithEmailAndPassword(auth, email, senha);
  if (nome) {
    await updateProfile(credencial.user, { displayName: nome });
  }
  return credencial.user;
}

export async function signIn(email, senha) {
  const credencial = await signInWithEmailAndPassword(auth, email, senha);
  return credencial.user;
}

export async function signOut() {
  await firebaseSignOut(auth);
}

export function onAuthChange(callback) {
  return onAuthStateChanged(auth, callback);
}
