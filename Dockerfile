FROM node:18-alpine

# Create app directory
WORKDIR /app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy app source code
COPY . .

# Create directories for uploads and config if they don't exist
RUN mkdir -p uploads config

# Expose port
EXPOSE 3000

# Start the application
CMD ["node", "index.js"]
