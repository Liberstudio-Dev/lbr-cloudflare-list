export interface CloudflareResponse {
  success: boolean;
  errors: any[];
  messages: any[];
  result: {
    operation_id: string;
  };
}

export interface CloudflareErrorData {
  errors?: Array<{ message: string }>;
}
