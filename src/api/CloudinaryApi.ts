const cloudinary = require('cloudinary').v2;

export default {
  upload(filePath: string): Promise<any> {
    const apiConfig = {
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    };
    return new Promise((resolve, reject) => {
      cloudinary.uploader.upload(
        filePath,
        {
          ...apiConfig,
          resource_type: 'auto',
        },
        (error, resp) => {
          if (error) reject(error);
          resolve(resp);
        },
      );
    });
  },
};
