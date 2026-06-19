import { CSSProperties, ReactNode, ChangeEvent } from "react";

export interface FieldProps {
  label?: string;
  hint?: string;
  children?: ReactNode;
  style?: CSSProperties;
}

export interface InputProps {
  value?: string | number;
  onChange?: (e: ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
  type?: string;
  disabled?: boolean;
  error?: boolean;
  style?: CSSProperties;
}

export interface SelectProps {
  value?: string;
  onChange?: (e: ChangeEvent<HTMLSelectElement>) => void;
  children?: ReactNode;
  disabled?: boolean;
  style?: CSSProperties;
}

export declare function Field(props: FieldProps): JSX.Element;
export declare function Input(props: InputProps): JSX.Element;
export declare function Select(props: SelectProps): JSX.Element;
