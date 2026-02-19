#!/bin/sh
set -e

AWS_REGION="${AWS_REGION:-eu-west-2}"
STACK_NAME="${STACK_NAME:-ps-upload-api-prod}"
ALLOWED_ORIGINS="${ALLOWED_ORIGINS:-${ALLOWED_ORIGIN:-}}"
COGNITO_ISSUER="${COGNITO_ISSUER:-}"
COGNITO_AUDIENCE="${COGNITO_AUDIENCE:-}"
ALARM_TOPIC_ARN="${ALARM_TOPIC_ARN:-}"
THROTTLE_RPS="${THROTTLE_RPS:-}"
THROTTLE_BURST="${THROTTLE_BURST:-}"
WAF_ENABLED="${WAF_ENABLED:-}"
WAF_RATE_LIMIT="${WAF_RATE_LIMIT:-}"
WAF_MANAGED_RULES_ENABLED="${WAF_MANAGED_RULES_ENABLED:-}"
WAF_LOGGING_ENABLED="${WAF_LOGGING_ENABLED:-}"
WAF_LOG_RETENTION_DAYS="${WAF_LOG_RETENTION_DAYS:-}"
ENABLE_GD_SCAN="${ENABLE_GD_SCAN:-}"
BYPASS_SCAN_WHEN_DISABLED="${BYPASS_SCAN_WHEN_DISABLED:-}"

if [ -z "$ALLOWED_ORIGINS" ]; then
  echo "Missing required env var: ALLOWED_ORIGINS (or ALLOWED_ORIGIN)"
  echo "Example: ALLOWED_ORIGINS=\"https://www.politicalsolutions.uk,http://localhost:5173\""
  exit 1
fi

cd infra/upload-api

sam build

PARAM_OVERRIDES="AllowedOrigins=${ALLOWED_ORIGINS}"

if [ -n "$COGNITO_ISSUER" ]; then
  PARAM_OVERRIDES="$PARAM_OVERRIDES CognitoIssuer=${COGNITO_ISSUER}"
fi
if [ -n "$COGNITO_AUDIENCE" ]; then
  PARAM_OVERRIDES="$PARAM_OVERRIDES CognitoAudience=${COGNITO_AUDIENCE}"
fi
if [ -n "$ALARM_TOPIC_ARN" ]; then
  PARAM_OVERRIDES="$PARAM_OVERRIDES AlarmTopicArn=${ALARM_TOPIC_ARN}"
fi
if [ -n "$THROTTLE_RPS" ]; then
  PARAM_OVERRIDES="$PARAM_OVERRIDES ThrottlingRateLimit=${THROTTLE_RPS}"
fi
if [ -n "$THROTTLE_BURST" ]; then
  PARAM_OVERRIDES="$PARAM_OVERRIDES ThrottlingBurstLimit=${THROTTLE_BURST}"
fi
if [ -n "$WAF_ENABLED" ]; then
  PARAM_OVERRIDES="$PARAM_OVERRIDES WafEnabled=${WAF_ENABLED}"
fi
if [ -n "$WAF_RATE_LIMIT" ]; then
  PARAM_OVERRIDES="$PARAM_OVERRIDES WafRateLimit=${WAF_RATE_LIMIT}"
fi
if [ -n "$WAF_MANAGED_RULES_ENABLED" ]; then
  PARAM_OVERRIDES="$PARAM_OVERRIDES WafManagedRulesEnabled=${WAF_MANAGED_RULES_ENABLED}"
fi
if [ -n "$WAF_LOGGING_ENABLED" ]; then
  PARAM_OVERRIDES="$PARAM_OVERRIDES WafLoggingEnabled=${WAF_LOGGING_ENABLED}"
fi
if [ -n "$WAF_LOG_RETENTION_DAYS" ]; then
  PARAM_OVERRIDES="$PARAM_OVERRIDES WafLogRetentionDays=${WAF_LOG_RETENTION_DAYS}"
fi
if [ -n "$ENABLE_GD_SCAN" ]; then
  PARAM_OVERRIDES="$PARAM_OVERRIDES EnableGuardDutyScan=${ENABLE_GD_SCAN}"
fi
if [ -n "$BYPASS_SCAN_WHEN_DISABLED" ]; then
  PARAM_OVERRIDES="$PARAM_OVERRIDES BypassScanWhenDisabled=${BYPASS_SCAN_WHEN_DISABLED}"
fi

sam deploy --resolve-s3 \
  --stack-name "$STACK_NAME" \
  --capabilities CAPABILITY_IAM \
  --parameter-overrides $PARAM_OVERRIDES \
  --region "$AWS_REGION"

echo ""
echo "CloudFormation outputs:"
aws cloudformation describe-stacks \
  --stack-name "$STACK_NAME" \
  --query "Stacks[0].Outputs" \
  --region "$AWS_REGION"
