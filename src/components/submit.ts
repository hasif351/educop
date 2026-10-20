"use client";
import { startTransition, type FormEvent } from "react";

/**
 * React 19 resets a <form action> after every submission, which wipes what the
 * user typed when the server returns a validation error. Submitting through
 * onSubmit keeps the fields intact and still passes the clicked button's value.
 */
export function keepValues(dispatch: (fd: FormData) => void) {
  return (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget, (e.nativeEvent as SubmitEvent).submitter);
    startTransition(() => dispatch(fd));
  };
}
