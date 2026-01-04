#!/bin/bash
set -e

# Check if docker is running
if ! docker info > /dev/null 2>&1; then
  echo "Error: Docker is not running."
  exit 1
fi

# Start DynamoDB Local
echo "Starting DynamoDB Local..."
cd local-setup
docker-compose up -d

# Wait for DynamoDB to be ready
echo "Waiting for DynamoDB to start..."
sleep 3

# Initialize Tables
echo "Initializing Tables..."
# Ensure dependencies for init-db.js are installed (aws-sdk is in parent node_modules)
# We can run it from parent using the relative path to script
cd ..
node local-setup/init-db.js

echo "---------------------------------------------------"
echo "Local Backend is ready!"
echo "DynamoDB Admin UI: http://localhost:8001"
echo "DynamoDB Local: http://localhost:8000"
echo "API Endpoint: http://localhost:3000"
echo "---------------------------------------------------"
echo "Starting SAM API Local..."
echo "Press Ctrl+C to stop."

sam local start-api --env-vars env.json --port 3000 --docker-network local-setup_default --skip-pull-image
