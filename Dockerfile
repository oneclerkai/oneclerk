FROM python:3.10-slim

WORKDIR /app

# Copy your repository folders into the container
COPY . .

# Install dependencies from the root requirements file
RUN pip install --no-cache-dir -r requirements.txt

EXPOSE 8080

# Explicitly set the python environment path to find your code modules
ENV PYTHONPATH=/app/app:/app

# Run uvicorn referencing the exact path to main
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8080"]
