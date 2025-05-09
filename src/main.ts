import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule as NestSwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module'; // Import the real AppModule

async function bootstrap() {
  // Create application with the real AppModule that has actual service implementations
  const app = await NestFactory.create(AppModule);
  
  // Swagger setup
  const config = new DocumentBuilder()
    .setTitle('Cloud Storage API')
    .setDescription('API for secure cloud file storage with multi-provider support')
    .setVersion('1.0.0')
    .addTag('auth', 'Authentication endpoints')
    .addTag('files', 'File management endpoints')
    .addTag('stats', 'Statistics endpoints')
    .addBearerAuth()
    .build();
    
  const document = NestSwaggerModule.createDocument(app, config);
  NestSwaggerModule.setup('api-docs', app, document);
  
  // Start server
  const port = process.env.PORT || 3000;
  await app.listen(port);
  
  console.log(`Application is running on: http://localhost:${port}`);
  console.log(`Swagger documentation is available at: http://localhost:${port}/api-docs`);
  
  // Log the HEALTH_CHECK environment variable to verify env variables are loaded
  console.log(`HEALTH_CHECK environment variable: ${process.env.HEALTH_CHECK || 'Not found'}`);
}

bootstrap();
