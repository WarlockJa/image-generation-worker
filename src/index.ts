import { z } from 'zod';

export interface Env {
	AI: Ai;
	ACCESS_KEY: string;
}

const MAX_FILE_SIZE = 5000000;
const ACCEPTED_IMAGE_TYPES = ['image/'];

const fileSchema = z.any().transform((file, ctx) => {
	if (file?.size === 0) {
		ctx.addIssue({
			code: z.ZodIssueCode.custom,
			message: 'unsupported image type',
		});

		return z.NEVER;
	} else {
		// testing for max size
		if (file?.size > MAX_FILE_SIZE) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: `max image size is ${Math.floor(MAX_FILE_SIZE / 1000000)}MB`,
			});

			return z.NEVER;
		}
		// testing for image type
		if (!ACCEPTED_IMAGE_TYPES.includes(file?.type.slice(0, 6))) {
			// console.log(file.type);
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: 'unsupported image type',
			});
			return z.NEVER;
		}

		return file as File;
	}
});

const requestSchema = z.object({
	prompt: z.string({ required_error: 'Prompt required' }).min(15).max(255),
	image: fileSchema.optional(),
	mask: fileSchema.optional(),
	width: z.coerce.number().optional(),
	height: z.coerce.number().optional(),
	guidance: z.coerce.number().min(0).max(1).optional().default(0.75),
	strength: z.coerce.number().min(0).max(1).optional().default(0.5),
	seed: z.coerce.number().min(0).optional(),
});

export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		// checking for accesskey header
		const headers = new Headers(request.headers);
		const keyHeader = headers.get('x-access-key');
		if (keyHeader !== env.ACCESS_KEY) {
			return new Response('access denied', { status: 403 });
		}

		// Parse the form data
		const formData = await request.formData();
		const parsedData = requestSchema.safeParse(Object.fromEntries(formData.entries()));

		console.log(parsedData.error?.message);

		if (!parsedData.success) throw new Error(JSON.stringify(parsedData.error));

		// fetching image creating input object for image caption AI
		const inputs: AiTextToImageInput = {
			// ...parsedData.data,
			prompt: parsedData.data.prompt,
			image: parsedData.data.image ? [...new Uint8Array(await parsedData.data.image.arrayBuffer())] : undefined,
			mask: parsedData.data.mask ? [...new Uint8Array(await parsedData.data.mask.arrayBuffer())] : undefined,
			width: parsedData.data.width,
			height: parsedData.data.height,
			guidance: parsedData.data.guidance,
			seed: parsedData.data.seed,
		};

		const response = await env.AI.run('@cf/runwayml/stable-diffusion-v1-5-inpainting', inputs);
		// const response = await env.AI.run('@cf/stabilityai/stable-diffusion-xl-base-1.0', inputs);
		// const response = await env.AI.run('@cf/lykon/dreamshaper-8-lcm', inputs);
		// const response = await env.AI.run('@cf/bytedance/stable-diffusion-xl-lightning', inputs);

		return new Response(response, {
			status: 200,
			headers: {
				'Access-Control-Allow-Origin': '*',
				'content-type': 'image/png',
			},
		});
	},
};
