import json
import boto3
import os

# IAM Permissions Required for Lambda Execution Role:
# ----------------------------------------------------
# The AWS Lambda execution role that uses this script needs the following IAM permission:
#
# 1. scheduler:UpdateSchedule
#
# This permission allows the function to enable or disable the EventBridge schedule.
# It is best practice to scope this permission to the specific schedule resource.
#
# Example Policy Statement:
# {
#     "Version": "2012-10-17",
#     "Statement": [
#         {
#             "Effect": "Allow",
#             "Action": "scheduler:UpdateSchedule",
#             "Resource": "arn:aws:scheduler:us-east-1:236713206268:schedule/default/InfiniteDialogChatTrigger"
#         },
#         {
#             "Effect": "Allow",
#             "Action": [
#                 "logs:CreateLogGroup",
#                 "logs:CreateLogStream",
#                 "logs:PutLogEvents"
#             ],
#             "Resource": "arn:aws:logs:*:*:*"
#         }
#     ]
# }
# The logs permissions are standard for Lambda functions to write logs to CloudWatch.

# Define the specific ARN for the schedule
SCHEDULE_ARN = "arn:aws:scheduler:us-east-1:236713206268:schedule/default/InfiniteDialogChatTrigger"
# Extract GroupName and ScheduleName from the ARN
# ARN format: arn:aws:scheduler:region:account-id:schedule/group-name/schedule-name
try:
    SCHEDULE_PARTS = SCHEDULE_ARN.split(':')
    SCHEDULE_NAME_FULL = SCHEDULE_PARTS[-1]
    SCHEDULE_PATH_PARTS = SCHEDULE_NAME_FULL.split('/')
    if len(SCHEDULE_PATH_PARTS) == 2: # format group/name
        GROUP_NAME = SCHEDULE_PATH_PARTS[0]
        SCHEDULE_NAME = SCHEDULE_PATH_PARTS[1]
    elif len(SCHEDULE_PATH_PARTS) == 1: # format name (implies default group)
        GROUP_NAME = "default"
        SCHEDULE_NAME = SCHEDULE_PATH_PARTS[0]
    else:
        raise ValueError("Schedule ARN format is incorrect for parsing GroupName and ScheduleName.")

except IndexError as e:
    print(f"Error: Could not parse SCHEDULE_ARN: {SCHEDULE_ARN}. Malformed ARN. {e}")
    # Set to None or handle as a critical error preventing function execution
    GROUP_NAME = None
    SCHEDULE_NAME = None
except ValueError as e:
    print(f"Error: {e}")
    GROUP_NAME = None
    SCHEDULE_NAME = None


def lambda_handler(event, context):
    # Placeholder for now
    print(f"Received event: {json.dumps(event)}")

    if not GROUP_NAME or not SCHEDULE_NAME:
        print("Error: GROUP_NAME or SCHEDULE_NAME could not be determined from ARN. Aborting.")
        return {
            'statusCode': 500,
            'body': json.dumps({'error': 'Configuration error: Could not parse Schedule ARN'})
        }

    print(f"Operating on Schedule: {SCHEDULE_NAME}, Group: {GROUP_NAME}")

    action = event.get('action')

    if action not in ['enable', 'disable']:
        print(f"Error: Invalid action '{action}'. Must be 'enable' or 'disable'.")
        return {
            'statusCode': 400,
            'body': json.dumps({'error': f"Invalid action '{action}'. Must be 'enable' or 'disable'."})
        }

    try:
        scheduler_client = boto3.client('scheduler')
    except Exception as e:
        print(f"Error initializing Boto3 scheduler client: {e}")
        return {
            'statusCode': 500,
            'body': json.dumps({'error': f'Error initializing Boto3 client: {str(e)}'})
        }

    try:
        if action == 'enable':
            print(f"Enabling schedule: {SCHEDULE_NAME} in group {GROUP_NAME}")
            scheduler_client.update_schedule(
                GroupName=GROUP_NAME,
                Name=SCHEDULE_NAME,
                State='ENABLED'
            )
            message = f"Schedule {SCHEDULE_NAME} in group {GROUP_NAME} enabled successfully."
        elif action == 'disable':
            print(f"Disabling schedule: {SCHEDULE_NAME} in group {GROUP_NAME}")
            scheduler_client.update_schedule(
                GroupName=GROUP_NAME,
                Name=SCHEDULE_NAME,
                State='DISABLED'
            )
            message = f"Schedule {SCHEDULE_NAME} in group {GROUP_NAME} disabled successfully."

        print(message)
        return {
            'statusCode': 200,
            'body': json.dumps({'message': message})
        }

    except Exception as e:
        error_message = f"Error {action}ing schedule {SCHEDULE_NAME} in group {GROUP_NAME}: {str(e)}"
        print(error_message)
        return {
            'statusCode': 500,
            'body': json.dumps({'error': error_message})
        }

if __name__ == '__main__':
    # Example event for local testing
    test_event_enable = {
        "action": "enable"
    }
    test_event_disable = {
        "action": "disable"
    }

    print("--- Local Testing ---")
    if GROUP_NAME and SCHEDULE_NAME:
        print(f"Target Schedule ARN: {SCHEDULE_ARN}")
        print(f"Parsed GroupName: {GROUP_NAME}, ScheduleName: {SCHEDULE_NAME}\n")

        print("Testing ENABLE action:")
        response_enable = lambda_handler(test_event_enable, None)
        print(f"Response: {json.dumps(response_enable)}\n")

        print("Testing DISABLE action:")
        response_disable = lambda_handler(test_event_disable, None)
        print(f"Response: {json.dumps(response_disable)}\n")

        print("Testing INVALID action:")
        test_event_invalid = {"action": "unknown"}
        response_invalid = lambda_handler(test_event_invalid, None)
        print(f"Response: {json.dumps(response_invalid)}")
    else:
        print("Local testing skipped due to ARN parsing error.")
    print("--- End Local Testing ---")
