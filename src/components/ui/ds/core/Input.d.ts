import * as React from "react";

export interface FieldProps {
  /** Label rendered above the control. */
  label?: string;
  /** Helper text below the control. */
  hint?: string;
  required?: boolean;
  children?: React.ReactNode;
  style?: React.CSSProperties;
}
export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  /** Render the danger border. @default false */
  invalid?: boolean;
}
export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}
export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  children?: React.ReactNode;
}

/** Label + hint wrapper for any control. */
export function Field(props: FieldProps): JSX.Element;
/** Text input with focus ring. */
export function Input(props: InputProps): JSX.Element;
/** Multiline input. */
export function Textarea(props: TextareaProps): JSX.Element;
/** Native select styled to match, with custom chevron. */
export function Select(props: SelectProps): JSX.Element;
