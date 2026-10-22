-- One database per service. Services never read or write each other's tables.
CREATE DATABASE "identity-service";
CREATE DATABASE "workflow-service";
CREATE DATABASE "decision-service";
CREATE DATABASE "integration-service";
