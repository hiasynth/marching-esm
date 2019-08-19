const SceneNode = require( './sceneNode.js' ),
      getPixels = require( 'get-pixels' ),
      createTexture = require( 'gl-texture2d' ),
      { param_wrap, MaterialID } = require( './utils.js' ),
      { Var, float_var_gen, vec2_var_gen, vec3_var_gen, vec4_var_gen, int_var_gen, VarAlloc }  = require( './var.js' ), 
      { Vec2, Vec3, Vec4 } = require( './vec.js' )

const glsl = require( 'glslify' )

const __Textures = function( SDF ) {
  const gens = { 
    int:   int_var_gen,
    float: float_var_gen,
    vec2: vec2_var_gen,
    vec3: vec3_var_gen,
    vec4: vec4_var_gen,
  }

  const vars = { 
    vec2: Vec2,
    vec3: Vec3,
    vec4: Vec4
  }

  const Textures = {
    textures:[],
    __textures:[],

    __texturePrefaces:[],
    __textureBodies:  [],

    __types:{
      checkers: {
        name:'checkers',
        glsl:`          
            vec3 checkers( vec3 pos, vec3 normal, float size ) {
              vec3 tex;
              pos  = pos * size;
              if ((int(floor(pos.x) + floor(pos.y) + floor(pos.z)) & 1) == 0) {
                tex = vec3(.5);
              }else{
                tex = vec3(0.);
              }

              return tex;
            }`,
        parameters: [
          { name:'size', type:'float', default:8 }
        ],
        init(){}
      },
      noise: {
        name:'noise',
        glsl:`          
            vec3 noise( vec3 pos, vec3 normal ) {
              float n = snoise( pos*2. );
              return vec3( n );
            }`,
        parameters: [],
        init(){}
      },
    },

    //      float n = snoise( pos*2. );
    //      tex = vec3( n );
    __emitFunction() {
      let decl = `
      vec3 getTexture( int id, vec3 pos, vec3 nor, vec3 pos_nt ) {
        vec3 tex;
        switch( id ) {\n`


      let funcdefs = ''
      this.textures.forEach( (t,i) => {
        if( Textures.__textureBodies.indexOf( t.glsl ) === -1 ) {
          Textures.__textureBodies.push( t.glsl )
        }

        const args = t.parameters.map( p => t[ p.name ].emit() ) 

        decl +=`
          case ${i}:
            tex = ${t.name}( pos, nor${ args.length > 0 ? ',' + args.join(',') : ''} );
            break;\n`            

      })

      decl += `
          default:
            tex = vec3(0.);
            break;
        }

        return tex;
      }\n`

      return { glsldefs: Textures.__textureBodies.join( '\n' ), mainfunc:decl }
    },

    clear() {
      Textures.textures.length = 0
    },

    addTexture( tex ) {
      //if( tex === undefined ) tex = Textures.texture.default

      //if( Textures.textures.indexOf( tex ) === -1 ) {
      tex.id = Textures.textures.length

      // we have to dirty the texture so that its data
      // will be uploaded to new shaders, otherwise the
      // texture will only work the first time it's used, when
      // it's dirty on initialization.
      Textures.dirty( tex )

      Textures.textures.push( tex )
      //} 

      return tex
    },

    texture( presetName='noise', props={} ){
      //const isPreset = filenameOrPreset.indexOf( '.' ) === -1
      //const defaults = { wrap:SDF.gl.MIRRORED_REPEAT }

      if( Textures.__types[ presetName ] === undefined ) {
        console.log( `the texture type '${presetName}' does not exist.` )
      }
      const tex = Object.assign( {}, Textures.__types[ presetName ], props )

      for( let param of tex.parameters ) {
        const defaultValues = param.default
        const isArray = Array.isArray( defaultValues )

        let count = 0
        if( isArray ) {
          let val = args[ count++ ], __var

          if( typeof val === 'number' ) {
            __var = Var( vars[ param.type ]( val ), null, 'vec3' )
          }else{
            __var =  param_wrap(
              val,
              gens[ param.type ]( ...defaultValues ) 
            )
          }

          // for assigning entire new vectors to property
          Object.defineProperty( tex, param.name, {
            configurable:true,
            get() { return __var },
            set(v) {
              if( typeof v === 'object' ) {
                __var.set( v )
              }else{
                __var.value.x = v
                __var.value.y = v
                __var.value.z = v
                __var.value.w = v
                __var.dirty = true
              }
            }
          })

        }else{
          let __var  = param_wrap( 
            props[ param.name ], 
            gens[ param.type ]( defaultValues ) 
          )

          //__var.set( defaultValues )
          Object.defineProperty( tex, param.name, {
            configurable:true,
            get() { return __var },
            set(v) {
              __var.set( v )
            }
          })
        }
      }

      //tex.image = getPixels( filenameOrPreset, (err,pixels) => {
      //  if( err !== null ) {
      //    console.error( err )
      //    return
      //  }
      //  tex.pixels = pixels
      //  tex.gltexture = createTexture( SDF.gl, pixels )
      //  tex.gltexture.wrap = tex.wrap
      //})

      Textures.addTexture( tex )

      return tex 
    },

    dirty( tex ) {},
   
    emit_decl() {
      if( this.textures.length === 0 ) return ``//uniform sampler2D textures[1];` 

      //let str = `uniform sampler2D textures[${this.textures.length}];\n\n` //= Texture[${this.textures.length}](`
      let decl = ''

      this.textures.forEach( (tex,i) => {
        for( let param of tex.parameters ) {
          if( param.name !== 'material' )
            decl += tex[ param.name ].emit_decl()
        }
      })

      return decl
    },
    
    update_location( gl, program ) {
      if( this.textures.length > 0 ) {
        this.textures.forEach( (tex,i) => {
          for( let param of tex.parameters ) {
            if( param.type !== 'obj' ) {
              if( param.name !== 'material' ) 
                tex[ param.name ].update_location( gl,program )
            }
          }
        })
      }

      //if( this.textures.length > 0 ) {
      //  this.textures.sort( (a,b) => a.id > b.id ? 1 : -1 ) 

      //  for( let tex of this.textures ) {
      //    tex.loc = gl.getUniformLocation( program, `textures[${tex.id}]` )
      //    tex.gltexture.bind( tex.id )
      //  }

      //  this.__textures = this.textures.slice( 0 )
      //  this.textures.length = 0
      //}
    },

    upload_data( gl, program ) {
      if( this.textures.length > 0 ) {
        this.textures.forEach( (tex,i) => {
          for( let param of tex.parameters ) {
            if( param.type !== 'obj' && param.name !== 'material' )
              tex[ param.name ].upload_data( gl )
          }
        })
      }
    }

  }

  const f = value => value % 1 === 0 ? value.toFixed(1) : value 

  return Textures
}

module.exports = __Textures
