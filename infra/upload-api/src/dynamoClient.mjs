import { createRequire } from "module";

const require = createRequire(import.meta.url);

const REGION = process.env.AWS_REGION || "eu-west-2";

let sharedDocumentClient;
let cachedAwsSdk;

function getAwsSdk() {
  if (cachedAwsSdk) return cachedAwsSdk;
  try {
    cachedAwsSdk = require("aws-sdk");
  } catch (error) {
    if (globalThis.__AWS_SDK_MOCK__) {
      cachedAwsSdk = globalThis.__AWS_SDK_MOCK__;
    } else {
      throw error;
    }
  }
  return cachedAwsSdk;
}

export function createDocumentClient() {
  const AWS = getAwsSdk();
  return new AWS.DynamoDB.DocumentClient({ region: REGION });
}

export function getDocumentClient() {
  if (!sharedDocumentClient) {
    sharedDocumentClient = createDocumentClient();
  }
  return sharedDocumentClient;
}
